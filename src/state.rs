use crate::{config::Config, error::{ApiError, ApiResult}, ratelimit::RateLimiter};
use sqlx::PgPool;
use std::{sync::Arc, time::Duration};

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub cfg: Arc<Config>,
    pub limiter: Arc<RateLimiter>,
}

impl AppState {
    pub fn new(db: PgPool, cfg: Config) -> Self {
        AppState { db, cfg: Arc::new(cfg), limiter: Arc::new(RateLimiter::new()) }
    }

    /// Process-local limit; only for high-rate, low-stakes paths (redirects).
    pub fn rate_limit_local(&self, key: &str, max: u32, window_secs: u64) -> ApiResult<()> {
        if !self.cfg.rate_limit_enabled {
            return Ok(());
        }
        if self.limiter.check(key, max, Duration::from_secs(window_secs)) {
            Ok(())
        } else {
            Err(ApiError::TooMany)
        }
    }

    /// Postgres-backed fixed-window limit shared by every app replica. One atomic upsert per call.
    /// Keys are hashed so e-mail addresses are not stored in the table.
    pub async fn rate_limit(&self, key: &str, max: u32, window_secs: u64) -> ApiResult<()> {
        if !self.cfg.rate_limit_enabled {
            return Ok(());
        }
        let hits: i32 = sqlx::query_scalar(
            "insert into rate_limits as r (key, window_start, hits) values ($1, now(), 1)
             on conflict (key) do update set
               hits = case when r.window_start + make_interval(secs => $2) <= now() then 1 else r.hits + 1 end,
               window_start = case when r.window_start + make_interval(secs => $2) <= now() then now() else r.window_start end
             returning hits",
        )
        .bind(crate::util::sha256_hex(key))
        .bind(window_secs as f64)
        .fetch_one(&self.db)
        .await?;
        if hits as u32 > max { Err(ApiError::TooMany) } else { Ok(()) }
    }

    pub async fn setting(&self, key: &str) -> Option<String> {
        sqlx::query_scalar::<_, String>("select value from app_settings where key = $1")
            .bind(key)
            .fetch_optional(&self.db)
            .await
            .ok()
            .flatten()
    }

    pub async fn setting_bool(&self, key: &str, default: bool) -> bool {
        self.setting(key).await.map(|v| v == "true").unwrap_or(default)
    }

    pub async fn audit(&self, actor: Option<i64>, action: &str, target_type: &str, target_id: &str, details: serde_json::Value) {
        let r = sqlx::query("insert into audit_logs (actor_id, action, target_type, target_id, details) values ($1,$2,$3,$4,$5)")
            .bind(actor).bind(action).bind(target_type).bind(target_id).bind(details)
            .execute(&self.db).await;
        if let Err(e) = r {
            tracing::error!("failed to write audit log: {e}");
        }
    }
}
