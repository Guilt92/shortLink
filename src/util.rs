use crate::{config::Config, error::{ApiError, ApiResult}};
use rand::{Rng, RngCore};
use sha3::{Digest, Sha3_256};
use url::Url;

const RESERVED: &[&str] = &[
    "api", "app", "static", "health", "ready", "assets", "admin", "login", "register", "create",
    "metrics", "favicon.ico", "robots.txt", "dashboard",
];
const ALPHABET: &[u8] = b"abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

pub fn sha256_hex(input: &str) -> String {
    hex::encode(Sha3_256::digest(input.as_bytes()))
}

/// 256-bit random token, hex-encoded (used for sessions and reset links).
pub fn random_token() -> String {
    let mut b = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut b);
    hex::encode(b)
}

pub fn generate_code() -> String {
    let mut rng = rand::thread_rng();
    (0..7).map(|_| ALPHABET[rng.gen_range(0..ALPHABET.len())] as char).collect()
}

pub fn validate_alias(alias: &str) -> ApiResult<()> {
    if !(3..=32).contains(&alias.len())
        || !alias.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(ApiError::bad("Alias must be 3-32 characters: letters, digits, '-' or '_'"));
    }
    if RESERVED.contains(&alias.to_lowercase().as_str()) {
        return Err(ApiError::bad("This alias is reserved"));
    }
    Ok(())
}

/// Validates a redirect target: http(s) only, has a host, no embedded credentials,
/// and does not point back at the shortener itself (redirect loops).
pub fn validate_target(raw: &str, cfg: &Config) -> ApiResult<String> {
    let raw = raw.trim();
    if raw.is_empty() || raw.len() > 2048 {
        return Err(ApiError::bad("URL must be between 1 and 2048 characters"));
    }
    let url = Url::parse(raw).map_err(|_| ApiError::bad("URL is malformed"))?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(ApiError::bad("Only http and https URLs are allowed"));
    }
    let host = url.host_str().ok_or_else(|| ApiError::bad("URL must include a host"))?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err(ApiError::bad("URLs with embedded credentials are not allowed"));
    }
    if host.eq_ignore_ascii_case(&cfg.base_host()) {
        return Err(ApiError::bad("Links to this service itself are not allowed"));
    }
    Ok(url.to_string())
}

pub fn normalize_email(email: &str) -> ApiResult<String> {
    let e = email.trim().to_lowercase();
    let ok = e.len() <= 254
        && e.matches('@').count() == 1
        && !e.starts_with('@')
        && !e.ends_with('@')
        && e.split('@').nth(1).map(|d| d.contains('.') && !d.starts_with('.') && !d.ends_with('.')).unwrap_or(false)
        && !e.chars().any(|c| c.is_whitespace() || c.is_control());
    if ok { Ok(e) } else { Err(ApiError::bad("Enter a valid email address")) }
}

pub fn validate_password(p: &str) -> ApiResult<()> {
    if p.len() < 8 || p.len() > 128 {
        return Err(ApiError::bad("Password must be 8-128 characters"));
    }
    if !p.chars().any(|c| c.is_alphabetic()) || !p.chars().any(|c| c.is_ascii_digit()) {
        return Err(ApiError::bad("Password must contain at least one letter and one digit"));
    }
    Ok(())
}

pub fn validate_hostname(h: &str) -> ApiResult<String> {
    let h = h.trim().to_lowercase();
    let labels_ok = h.split('.').all(|l| {
        !l.is_empty() && l.len() <= 63 && !l.starts_with('-') && !l.ends_with('-')
            && l.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    });
    if h.len() > 253 || !h.contains('.') || !labels_ok {
        return Err(ApiError::bad("Enter a valid domain name such as links.example.com"));
    }
    Ok(h)
}

pub struct Ua {
    pub device: &'static str,
    pub browser: &'static str,
    pub os: &'static str,
}

pub fn parse_user_agent(ua: &str) -> Ua {
    let l = ua.to_lowercase();
    let device = if l.contains("bot") || l.contains("crawler") || l.contains("spider") || l.contains("curl/") || l.contains("wget") {
        "Bot"
    } else if l.contains("ipad") || l.contains("tablet") {
        "Tablet"
    } else if l.contains("mobi") || l.contains("iphone") || l.contains("android") {
        "Mobile"
    } else {
        "Desktop"
    };
    let browser = if l.contains("edg/") || l.contains("edge/") { "Edge" }
        else if l.contains("opr/") || l.contains("opera") { "Opera" }
        else if l.contains("firefox/") || l.contains("fxios") { "Firefox" }
        else if l.contains("chrome/") || l.contains("crios") { "Chrome" }
        else if l.contains("safari/") { "Safari" }
        else { "Other" };
    let os = if l.contains("windows") { "Windows" }
        else if l.contains("iphone") || l.contains("ipad") || l.contains("ios") { "iOS" }
        else if l.contains("android") { "Android" }
        else if l.contains("mac os") || l.contains("macintosh") { "macOS" }
        else if l.contains("linux") { "Linux" }
        else { "Other" };
    Ua { device, browser, os }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_validation() {
        let cfg = Config::for_tests();
        assert!(validate_target("https://example.com/a?b=1", &cfg).is_ok());
        assert!(validate_target("javascript:alert(1)", &cfg).is_err());
        assert!(validate_target("data:text/html,hi", &cfg).is_err());
        assert!(validate_target("file:///etc/passwd", &cfg).is_err());
        assert!(validate_target("https://user:pw@example.com", &cfg).is_err());
        assert!(validate_target("http://short.test/abc", &cfg).is_err());
        assert!(validate_target("not a url", &cfg).is_err());
    }

    #[test]
    fn aliases() {
        assert!(validate_alias("my-link_1").is_ok());
        assert!(validate_alias("ab").is_err());
        assert!(validate_alias("api").is_err());
        assert!(validate_alias("bad/slash").is_err());
    }

    #[test]
    fn passwords_and_emails() {
        assert!(validate_password("short1").is_err());
        assert!(validate_password("longpassword").is_err());
        assert!(validate_password("goodpass123").is_ok());
        assert_eq!(normalize_email(" A@B.com ").unwrap(), "a@b.com");
        assert!(normalize_email("nope").is_err());
    }

    #[test]
    fn hostnames() {
        assert!(validate_hostname("links.example.com").is_ok());
        assert!(validate_hostname("http://x.com").is_err());
        assert!(validate_hostname("localhost").is_err());
    }

    #[test]
    fn codes_are_unique_enough() {
        let a = generate_code();
        assert_eq!(a.len(), 7);
        assert_ne!(a, generate_code());
    }
}
