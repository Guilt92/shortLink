use axum::body::Body;
use axum::extract::Path;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use base64::engine::general_purpose;
use base64::Engine;
use rand::Rng;
use sqlx::PgPool;
use crate::utils::internal_error;

const DEFAULT_CACHE_CONTROL_HEADER_VALUE: &str =
    "public, max-age=300, s-maxage=300, stale-while-revalidate=300, stale-if-error=300";

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub id: String,
    pub target_url: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkTarget {
    pub target_url: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountedLinkStatistic {
    pub amount: Option<i64>,
    pub referer: Option<String>,
    pub user_agent: Option<String>,
}

fn generate_id() -> String {
    let random_number = rand::thread_rng().gen_range(0..u32::MAX);
    general_purpose::URL_SAFE_NO_PAD.encode(random_number.to_string())
}

pub async fn health() -> impl IntoResponse {
    (StatusCode::OK, "Service is healthy")
}

pub async fn redirect(
    State(pool): State<PgPool>,
    Path(requested_link): Path<String>,
) -> Result<Response, (StatusCode, String)> {
    let select_timeout = tokio::time::Duration::from_millis(300);

    let link = tokio::time::timeout(
        select_timeout,
        sqlx::query_as!(
            Link,
            "select id, target_url from link where id=$1",
            requested_link
        )
        .fetch_optional(&pool),
    )
    .await
    .map_err(internal_error)?
    .map_err(internal_error)?
    .ok_or_else(|| "Not Found".to_string())
    .map_err(|err| (StatusCode::NOT_FOUND, err))?;

    tracing::debug!(
        "Redirecting link id {} to {}",
        requested_link, 
        link.target_url
    );

    Ok(Response::builder()
        .status(StatusCode::TEMPORARY_REDIRECT)
        .header("Location", link.target_url)
        .body(Body::empty())
        .expect("This response should always be constructable"))
}
