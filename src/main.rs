mod auth;
mod routes;
mod utils;
use crate::{
    auth::auth,
    routes::{create_link, get_link_statistic, health, redirect, update_link},
};
use axum::{
    middleware,
    response::Html,
    routing::{get, patch, post},
    Router,
};
use axum_prometheus::PrometheusMetricLayer;
use sqlx::postgres::PgPoolOptions;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{prelude::*, util::SubscriberInitExt};
use dotenvy::dotenv; 
use maud::Markup;
use std::error::Error;


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
        .max_connections(200)
        .connect(&db_url)
        .await?;

    let (_prometheus_layer, metric_handle) = PrometheusMetricLayer::pair();

    let app = Router::new()
        .route("/", get(root))
        .route("/create", post(create_link))
        .route("/:id/statistics", get(get_link_statistic))
        .route_layer(middleware::from_fn_with_state(db.clone(), auth))
        .route(
            "/:id",
            patch(update_link)
                .route_layer(middleware::from_fn_with_state(db.clone(), auth))
                .get(redirect),
        )
        .route("/metrics", get(|| async move { metric_handle.render() }))
        .route("/health", get(health))
        .layer(TraceLayer::new_for_http())
        .layer(_prometheus_layer)
        .with_state(db);

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

async fn root() -> Html<String> {
    outer_template(maud::html! {
        h3 class="text-4xl mb-4 font-bold animate-pulse" { "OuTiS92" }
    })
}

fn outer_template(body: Markup) -> Html<String> {
    Html(
        maud::html! {
            script src="https://cdn.tailwindcss.com/3.4.16" {}
            body class="flex flex-col items-center justify-center h-screen bg-black text-white" {
                (body)
            }
        }
        .into_string(),
    )
}
