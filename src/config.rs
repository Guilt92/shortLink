use rand::RngCore;

#[derive(Clone, Debug)]
pub struct Config {
    pub public_base_url: String,
    pub cookie_secure: bool,
    pub trust_proxy: bool,
    pub session_ttl_days: i64,
    pub visitor_salt: String,
    pub mail_log: bool,
    pub frontend_dist: String,
    pub static_dir: String,
    pub bootstrap_email: Option<String>,
    pub bootstrap_password: Option<String>,
    /// Multiplier applied to rate-limit budgets (tests lower/raise it).
    pub rate_limit_enabled: bool,
}

fn env_bool(key: &str) -> Option<bool> {
    std::env::var(key).ok().map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"))
}

fn random_hex(n: usize) -> String {
    let mut b = vec![0u8; n];
    rand::rngs::OsRng.fill_bytes(&mut b);
    hex::encode(b)
}

impl Config {
    pub fn from_env() -> Self {
        let public_base_url = std::env::var("PUBLIC_BASE_URL")
            .unwrap_or_else(|_| "http://localhost:3000".into())
            .trim_end_matches('/')
            .to_string();
        let https = public_base_url.starts_with("https://");
        Config {
            cookie_secure: env_bool("COOKIE_SECURE").unwrap_or(https),
            trust_proxy: env_bool("TRUST_PROXY").unwrap_or(false),
            session_ttl_days: std::env::var("SESSION_TTL_DAYS").ok().and_then(|v| v.parse().ok()).unwrap_or(14),
            visitor_salt: std::env::var("VISITOR_SALT").unwrap_or_else(|_| random_hex(16)),
            mail_log: std::env::var("MAIL_MODE").map(|v| v == "log").unwrap_or(false),
            frontend_dist: std::env::var("FRONTEND_DIST").unwrap_or_else(|_| "./frontend/dist".into()),
            static_dir: std::env::var("STATIC_DIR").unwrap_or_else(|_| "./website/static".into()),
            bootstrap_email: std::env::var("ADMIN_EMAIL").ok().filter(|v| !v.is_empty()),
            bootstrap_password: std::env::var("ADMIN_PASSWORD").ok().filter(|v| !v.is_empty()),
            rate_limit_enabled: env_bool("RATE_LIMIT_ENABLED").unwrap_or(true),
            public_base_url,
        }
    }

    pub fn for_tests() -> Self {
        Config {
            public_base_url: "http://short.test".into(),
            cookie_secure: false,
            trust_proxy: true,
            session_ttl_days: 14,
            visitor_salt: "test-salt".into(),
            mail_log: false,
            frontend_dist: "./frontend/dist".into(),
            static_dir: "./website/static".into(),
            bootstrap_email: None,
            bootstrap_password: None,
            rate_limit_enabled: true,
        }
    }

    pub fn base_host(&self) -> String {
        url::Url::parse(&self.public_base_url)
            .ok()
            .and_then(|u| u.host_str().map(|h| h.to_lowercase()))
            .unwrap_or_default()
    }

    pub fn scheme(&self) -> &str {
        if self.public_base_url.starts_with("https://") { "https" } else { "http" }
    }
}
