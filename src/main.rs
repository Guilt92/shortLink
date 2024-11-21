mod routes;
mod utils;
use axum::routing::get;
use axum::Router;
use axum_prometheus::lifecycle::layer;
use axum_prometheus::PrometheusMetricLayer;
use dotenvy::dotenv;
use routes::health;
use sqlx::postgres::PgPoolOptions;
use std::error::Error;
use tower_http::trace::TraceLayer;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    dotenv().ok();
    // log
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "link_short=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let db_url =
        std::env::var("DATABASE_URL").expect("DATABASE_URL is a required environment variable");

    let db = PgPoolOptions::new()
        .max_connections(20)
        .connect(&db_url)
        .await?;

    let (_prometheus_layer, metric_handle) = PrometheusMetricLayer::pair();

    let app = Router::new()
        .route("/metrics", get(|| async move { metric_handle.render() }))
        .route("/health", get(health))
        .layer(TraceLayer::new_for_http())
        .layer(_prometheus_layer);
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await
        .expect("Could Not Respond TcpListener Bind");

    tracing::debug!(
        "listening on {}",
        listener
            .local_addr()
            .expect("Could Not Connect to local_addr ")
    );

    axum::serve(listener, app)
        .await
        .expect("Could Not TO Serve Create Axum");

    Ok(())
}
