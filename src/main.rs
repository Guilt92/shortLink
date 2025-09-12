mod auth;
mod routes;
mod utils;

// use crate::{
//      auth::auth,
//     routes::{create_link, get_link_statistic, health, redirect, update_link},
// };

mod frontend {
    use axum::response::Html;
}

use crate::routes::{create_link, health, redirect};
use axum::{
    middleware,
    response::Html,
    routing::{get, patch, post},
    Router,
};
use axum_prometheus::PrometheusMetricLayer;
use dotenvy::dotenv;
use maud::html;
use maud::Markup;
use sqlx::postgres::PgPoolOptions;
use std::error::Error;
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{prelude::*, util::SubscriberInitExt};

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

    // let (_prometheus_layer, metric_handle) = PrometheusMetricLayer::pair();

    let app = Router::new()
        .route("/", get(index))
        .nest_service("/static", ServeDir::new("./website/static"))
        .route("/create", post(create_link))
        .route("/:id", get(redirect))
        // .route("/:id/statistics", get(get_link_statistic))
        // .route_layer(middleware::from_fn_with_state(db.clone(), auth))
        // .route(
        //     "/:id",
        //     patch(update_link)
        //         .route_layer(middleware::from_fn_with_state(db.clone(), auth))
        //         .get(redirect),
        // )
        // .route("/metrics", get(|| async move { metric_handle.render() }))
        .route("/health", get(health))
        .layer(TraceLayer::new_for_http())
        // .layer(_prometheus_layer)
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

pub async fn index() -> Html<String> {
    Html(
        html! {
            html lang="en" {
                head {
                    meta charset="UTF-8";
                    meta name="viewport" content="width=device-width, initial-scale=1.0";
                    title { "Short Link Service" }
                    link rel="stylesheet" href="/static/style.css";
                    script src="https://cdn.jsdelivr.net/npm/particles.js" {}
                    script defer src="/static/script.js" {}
                }
                body {
                    div id="particles-js" {}
                    div class="container" {
                        h1 { "ShortLink Generator" }
                        div class="email-box" {
                            input type="text" placeholder=" Enter your URL";
                            button { "Go" }
                        }
                    }
                }
            }
        }
        .into_string(),
    )
}
