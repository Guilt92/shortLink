use link_shortener::{auth, build_app, config::Config, state::AppState};
use sqlx::postgres::PgPoolOptions;
use std::{error::Error, net::SocketAddr, time::Duration};
use tracing_subscriber::{prelude::*, util::SubscriberInitExt};

async fn shutdown_signal() {
    let ctrl_c = async { tokio::signal::ctrl_c().await.ok(); };
    #[cfg(unix)]
    let term = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) { s.recv().await; }
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = term => {} }
    tracing::info!("shutdown signal received");
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "link_shortener=debug,tower_http=info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL is a required environment variable");
    let max_conn = std::env::var("DB_MAX_CONNECTIONS").ok().and_then(|v| v.parse().ok()).unwrap_or(20);
    let db = PgPoolOptions::new().max_connections(max_conn).acquire_timeout(Duration::from_secs(5)).connect(&db_url).await?;
    sqlx::migrate!("./migrations").run(&db).await?;

    let cfg = Config::from_env();
    if cfg.mail_log && cfg.public_base_url.starts_with("https://") {
        tracing::warn!("MAIL_MODE=log is enabled with an https PUBLIC_BASE_URL: live password-reset links are being written to the logs. This is for development only.");
    }
    if std::env::var("VISITOR_SALT").map(|v| v.is_empty()).unwrap_or(true) {
        tracing::warn!("VISITOR_SALT is not set: unique-visitor hashes change on every restart and differ between replicas.");
    }
    let state = AppState::new(db.clone(), cfg);
    auth::bootstrap_admin(&state).await;

    // Hourly cleanup of expired sessions and reset tokens.
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(3600)).await;
            let _ = sqlx::query("delete from sessions where expires_at < now()").execute(&db).await;
            let _ = sqlx::query("delete from rate_limits where window_start < now() - interval '1 day'").execute(&db).await;
            let _ = sqlx::query("delete from password_resets where expires_at < now() - interval '1 day'").execute(&db).await;
        }
    });

    let addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:3000".into());
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("listening on {}", listener.local_addr()?);
    axum::serve(listener, build_app(state).into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}
