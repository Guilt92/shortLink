use crate::{
    error::{ApiError, ApiJson, ApiResult},
    state::AppState,
    util::*,
};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    async_trait,
    extract::{ConnectInfo, FromRequestParts, State},
    http::{header, request::Parts, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;
use std::net::SocketAddr;

pub const COOKIE: &str = "sl_session";

#[derive(Clone, Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    pub id: i64,
    pub email: String,
    pub name: String,
    pub role: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl AuthUser {
    pub fn is_admin(&self) -> bool {
        self.role == "admin" || self.role == "super_admin"
    }
}

pub struct ClientIp(pub String);

#[async_trait]
impl FromRequestParts<AppState> for ClientIp {
    type Rejection = ApiError;
    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        if state.cfg.trust_proxy {
            // Rightmost entry is the one appended by our (trusted) reverse proxy.
            if let Some(ip) = parts.headers.get("x-forwarded-for").and_then(|v| v.to_str().ok())
                .and_then(|v| v.rsplit(',').next()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
            {
                return Ok(ClientIp(ip));
            }
        }
        let ip = parts.extensions.get::<ConnectInfo<SocketAddr>>().map(|c| c.0.ip().to_string()).unwrap_or_else(|| "unknown".into());
        Ok(ClientIp(ip))
    }
}

pub fn session_token(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    raw.split(';').filter_map(|p| p.trim().split_once('=')).find(|(k, _)| *k == COOKIE).map(|(_, v)| v.to_string())
}

#[async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;
    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let token = session_token(&parts.headers).ok_or(ApiError::Unauthorized)?;
        sqlx::query_as::<_, AuthUser>(
            "select u.id, u.email, u.name, u.role, u.created_at from sessions s join users u on u.id = s.user_id
             where s.token_hash = $1 and s.expires_at > now() and u.status = 'active'",
        )
        .bind(sha256_hex(&token))
        .fetch_optional(&state.db)
        .await?
        .ok_or(ApiError::Unauthorized)
    }
}

/// Extractor that only succeeds for admin / super_admin accounts (enforced server-side).
pub struct AdminUser(pub AuthUser);

#[async_trait]
impl FromRequestParts<AppState> for AdminUser {
    type Rejection = ApiError;
    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let u = AuthUser::from_request_parts(parts, state).await?;
        if u.is_admin() { Ok(AdminUser(u)) } else { Err(ApiError::Forbidden) }
    }
}

/// Argon2 allocates ~19 MiB per hash and is CPU-bound. Two things keep a login flood from exhausting
/// memory: (1) hashing runs on a small *dedicated* thread pool, because glibc keeps a malloc arena per
/// thread and tokio's elastic blocking pool retained over 1.2 GiB after a few hundred hashes in load
/// testing (OOM kill at 64 concurrent attempts); (2) a semaphore bounds queued work, and callers that
/// wait too long get a 503 instead of piling up.
const HASH_THREADS: usize = 4;
static HASH_GATE: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(HASH_THREADS * 2);

type HashJob = Box<dyn FnOnce() + Send + 'static>;

fn hash_pool() -> &'static std::sync::mpsc::Sender<HashJob> {
    static POOL: std::sync::OnceLock<std::sync::mpsc::Sender<HashJob>> = std::sync::OnceLock::new();
    POOL.get_or_init(|| {
        let (tx, rx) = std::sync::mpsc::channel::<HashJob>();
        let rx = std::sync::Arc::new(std::sync::Mutex::new(rx));
        for i in 0..HASH_THREADS {
            let rx = rx.clone();
            std::thread::Builder::new()
                .name(format!("argon2-{i}"))
                .spawn(move || loop {
                    let job = match rx.lock().unwrap_or_else(|p| p.into_inner()).recv() {
                        Ok(j) => j,
                        Err(_) => break,
                    };
                    job();
                })
                .expect("spawn hashing thread");
        }
        tx
    })
}

async fn run_hash<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> ApiResult<T> {
    let _permit = match tokio::time::timeout(std::time::Duration::from_secs(10), HASH_GATE.acquire()).await {
        Ok(Ok(p)) => p,
        _ => return Err(ApiError::Unavailable),
    };
    let (tx, rx) = tokio::sync::oneshot::channel();
    hash_pool().send(Box::new(move || { let _ = tx.send(f()); })).map_err(|_| ApiError::Internal)?;
    rx.await.map_err(|_| ApiError::Internal)
}

async fn hash_password(p: String) -> ApiResult<String> {
    run_hash(move || Argon2::default().hash_password(p.as_bytes(), &SaltString::generate(&mut OsRng)).map(|h| h.to_string()))
        .await?
        .map_err(|e| { tracing::error!("hash error: {e}"); ApiError::Internal })
}

async fn verify_password(p: String, hash: String) -> ApiResult<bool> {
    run_hash(move || PasswordHash::new(&hash).map(|h| Argon2::default().verify_password(p.as_bytes(), &h).is_ok()).unwrap_or(false)).await
}

fn cookie_header(state: &AppState, token: &str, max_age: i64) -> HeaderValue {
    let secure = if state.cfg.cookie_secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!("{COOKIE}={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={max_age}{secure}")).unwrap()
}

async fn create_session(state: &AppState, user_id: i64, headers: &HeaderMap) -> ApiResult<HeaderValue> {
    let token = random_token();
    let ua = headers.get(header::USER_AGENT).and_then(|v| v.to_str().ok()).map(|s| s.chars().take(255).collect::<String>());
    let ttl = state.cfg.session_ttl_days;
    sqlx::query("insert into sessions (user_id, token_hash, user_agent, expires_at) values ($1,$2,$3, now() + make_interval(days => $4::int))")
        .bind(user_id).bind(sha256_hex(&token)).bind(ua).bind(ttl as i32)
        .execute(&state.db).await?;
    sqlx::query("update users set last_login_at = now() where id = $1").bind(user_id).execute(&state.db).await?;
    Ok(cookie_header(state, &token, ttl * 86400))
}

#[derive(Deserialize)]
pub struct RegisterBody { pub name: String, pub email: String, pub password: String }

pub async fn create_user(state: &AppState, name: &str, email: &str, password: &str, role: &str) -> ApiResult<i64> {
    let hash = hash_password(password.to_string()).await?;
    let r: Result<i64, sqlx::Error> = sqlx::query_scalar("insert into users (email, name, password_hash, role) values ($1,$2,$3,$4) returning id")
        .bind(email).bind(name).bind(hash).bind(role).fetch_one(&state.db).await;
    match r {
        Ok(id) => Ok(id),
        Err(sqlx::Error::Database(e)) if e.is_unique_violation() => Err(ApiError::conflict("An account with this email already exists")),
        Err(e) => Err(e.into()),
    }
}

pub async fn register(State(state): State<AppState>, ClientIp(ip): ClientIp, headers: HeaderMap, ApiJson(b): ApiJson<RegisterBody>) -> ApiResult<Response> {
    state.rate_limit(&format!("register:{ip}"), 10, 3600).await?;
    if !state.setting_bool("allow_registration", true).await {
        return Err(ApiError::Forbidden);
    }
    let name = b.name.trim().to_string();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(ApiError::bad("Name is required (max 100 characters)"));
    }
    let email = normalize_email(&b.email)?;
    validate_password(&b.password)?;
    let id = create_user(&state, &name, &email, &b.password, "user").await?;
    state.audit(Some(id), "user.register", "user", &id.to_string(), json!({})).await;
    let cookie = create_session(&state, id, &headers).await?;
    let user = fetch_user(&state, id).await?;
    Ok((StatusCode::CREATED, [(header::SET_COOKIE, cookie)], Json(user)).into_response())
}

async fn fetch_user(state: &AppState, id: i64) -> ApiResult<AuthUser> {
    Ok(sqlx::query_as::<_, AuthUser>("select id, email, name, role, created_at from users where id = $1").bind(id).fetch_one(&state.db).await?)
}

#[derive(Deserialize)]
pub struct LoginBody { pub email: String, pub password: String, #[serde(default)] pub remember: bool }

pub async fn login(State(state): State<AppState>, ClientIp(ip): ClientIp, headers: HeaderMap, ApiJson(b): ApiJson<LoginBody>) -> ApiResult<Response> {
    let email = b.email.trim().to_lowercase();
    state.rate_limit(&format!("login-ip:{ip}"), 30, 900).await?;
    state.rate_limit(&format!("login-email:{email}"), 8, 900).await?;
    let row: Option<(i64, String, String)> = sqlx::query_as("select id, password_hash, status from users where lower(email) = $1")
        .bind(&email).fetch_optional(&state.db).await?;
    // Always run one Argon2 verification so response time does not reveal whether the account exists.
    let (ok, id, status) = match row {
        Some((id, h, s)) => (verify_password(b.password, h).await?, Some(id), s),
        None => {
            hash_password(b.password).await?; // comparable cost to a real verification
            (false, None, String::new())
        }
    };
    match (ok, id) {
        (true, Some(id)) if status == "active" => {
            let mut cookie = create_session(&state, id, &headers).await?;
            if !b.remember {
                // Session cookie (no Max-Age); server-side expiry still applies.
                let s = cookie.to_str().unwrap_or_default().split("; Max-Age=").next().unwrap_or_default().to_string()
                    + if state.cfg.cookie_secure { "; Secure" } else { "" };
                cookie = HeaderValue::from_str(&s).map_err(|_| ApiError::Internal)?;
            }
            let user = fetch_user(&state, id).await?;
            Ok(([(header::SET_COOKIE, cookie)], Json(user)).into_response())
        }
        (true, Some(_)) => Err(ApiError::Forbidden),
        _ => Err(ApiError::InvalidCredentials),
    }
}

pub async fn logout(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Response> {
    if let Some(t) = session_token(&headers) {
        sqlx::query("delete from sessions where token_hash = $1").bind(sha256_hex(&t)).execute(&state.db).await?;
    }
    Ok((StatusCode::NO_CONTENT, [(header::SET_COOKIE, cookie_header(&state, "", 0))]).into_response())
}

pub async fn me(user: AuthUser) -> Json<AuthUser> { Json(user) }

#[derive(Deserialize)]
pub struct UpdateMe { pub name: String }

pub async fn update_me(State(state): State<AppState>, user: AuthUser, ApiJson(b): ApiJson<UpdateMe>) -> ApiResult<Json<AuthUser>> {
    let name = b.name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(ApiError::bad("Name is required (max 100 characters)"));
    }
    sqlx::query("update users set name = $1 where id = $2").bind(name).bind(user.id).execute(&state.db).await?;
    Ok(Json(fetch_user(&state, user.id).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangePassword { pub current_password: String, pub new_password: String }

pub async fn change_password(State(state): State<AppState>, user: AuthUser, headers: HeaderMap, ApiJson(b): ApiJson<ChangePassword>) -> ApiResult<StatusCode> {
    state.rate_limit(&format!("chpw:{}", user.id), 10, 900).await?;
    validate_password(&b.new_password)?;
    let hash: String = sqlx::query_scalar("select password_hash from users where id = $1").bind(user.id).fetch_one(&state.db).await?;
    if !verify_password(b.current_password, hash).await? {
        return Err(ApiError::bad("Current password is incorrect"));
    }
    let new_hash = hash_password(b.new_password).await?;
    sqlx::query("update users set password_hash = $1 where id = $2").bind(new_hash).bind(user.id).execute(&state.db).await?;
    sqlx::query("update password_resets set used_at = now() where user_id = $1 and used_at is null").bind(user.id).execute(&state.db).await?;
    // Revoke every other session.
    let keep = session_token(&headers).map(|t| sha256_hex(&t)).unwrap_or_default();
    sqlx::query("delete from sessions where user_id = $1 and token_hash <> $2").bind(user.id).bind(keep).execute(&state.db).await?;
    state.audit(Some(user.id), "user.password_change", "user", &user.id.to_string(), json!({})).await;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct ForgotBody { pub email: String }

pub async fn forgot_password(State(state): State<AppState>, ClientIp(ip): ClientIp, ApiJson(b): ApiJson<ForgotBody>) -> ApiResult<Json<serde_json::Value>> {
    state.rate_limit(&format!("forgot-ip:{ip}"), 10, 3600).await?;
    let email = b.email.trim().to_lowercase();
    state.rate_limit(&format!("forgot-email:{email}"), 3, 3600).await?;
    let generic = Json(json!({ "message": "If an account exists for that email, a reset link has been sent." }));
    let uid: Option<i64> = sqlx::query_scalar("select id from users where lower(email) = $1 and status = 'active'").bind(&email).fetch_optional(&state.db).await?;
    if let Some(uid) = uid {
        let token = random_token();
        sqlx::query("insert into password_resets (user_id, token_hash, expires_at) values ($1,$2, now() + interval '1 hour')")
            .bind(uid).bind(sha256_hex(&token)).execute(&state.db).await?;
        let link = format!("{}/app/reset-password?token={}", state.cfg.public_base_url, token);
        if state.cfg.mail_log {
            // Development delivery only (MAIL_MODE=log). No SMTP transport is bundled.
            tracing::warn!("password reset link for {email}: {link}");
        } else {
            tracing::warn!("password reset requested but no mail transport is configured (set MAIL_MODE=log for development)");
        }
    }
    Ok(generic)
}

#[derive(Deserialize)]
pub struct ResetBody { pub token: String, pub password: String }

pub async fn reset_password(State(state): State<AppState>, ClientIp(ip): ClientIp, ApiJson(b): ApiJson<ResetBody>) -> ApiResult<StatusCode> {
    state.rate_limit(&format!("reset-ip:{ip}"), 10, 3600).await?;
    validate_password(&b.password)?;
    let mut tx = state.db.begin().await?;
    let uid: Option<i64> = sqlx::query_scalar(
        "update password_resets set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning user_id",
    ).bind(sha256_hex(&b.token)).fetch_optional(&mut *tx).await?;
    let uid = uid.ok_or_else(|| ApiError::bad("This reset link is invalid or has expired"))?;
    let hash = hash_password(b.password).await?;
    sqlx::query("update users set password_hash = $1 where id = $2").bind(hash).bind(uid).execute(&mut *tx).await?;
    sqlx::query("delete from sessions where user_id = $1").bind(uid).execute(&mut *tx).await?;
    // Any other outstanding reset links for this account die with the first one that is used.
    sqlx::query("update password_resets set used_at = now() where user_id = $1 and used_at is null").bind(uid).execute(&mut *tx).await?;
    tx.commit().await?;
    state.audit(Some(uid), "user.password_reset", "user", &uid.to_string(), json!({})).await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn bootstrap_admin(state: &AppState) {
    let (Some(email), Some(pw)) = (state.cfg.bootstrap_email.clone(), state.cfg.bootstrap_password.clone()) else { return };
    let Ok(email) = normalize_email(&email) else { tracing::error!("ADMIN_EMAIL is not a valid email"); return };
    if validate_password(&pw).is_err() { tracing::error!("ADMIN_PASSWORD does not satisfy the password policy"); return; }
    let exists: Option<i64> = sqlx::query_scalar("select id from users where lower(email) = $1").bind(&email).fetch_optional(&state.db).await.ok().flatten();
    if exists.is_none() {
        match create_user(state, "Administrator", &email, &pw, "super_admin").await {
            Ok(id) => tracing::info!("bootstrap super admin created (id {id})"),
            Err(_) => tracing::error!("failed to create bootstrap admin"),
        }
    }
}
