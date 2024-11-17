use axum::http::StatusCode;
use axum::response::IntoResponse;

pub async fn health() -> impl IntoResponse {
    (StatusCode::OK, "Service is healthy")
}


#[derive(serde::Deserialize , serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub id : String,
    pub target_url: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkTarget{
    pub target_url: String,
}