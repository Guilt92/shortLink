mod routes;

use std::error::Error;
use axum::Router;
use axum::routing::get;
use routes::health;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // log
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "link_short=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();


        let (prometheus_layer, metric_handle) = PrometheusMetricLayer::pair();

    let app = Router::new().route("/health", get(health));

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
