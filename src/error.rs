use axum::{
    extract::rejection::{JsonRejection, QueryRejection},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Debug)]
pub enum ApiError {
    BadRequest(String),
    Unauthorized,
    InvalidCredentials,
    Forbidden,
    NotFound,
    Conflict(String),
    Gone,
    TooMany,
    Internal,
}

pub type ApiResult<T> = Result<T, ApiError>;

impl ApiError {
    pub fn bad(msg: impl Into<String>) -> Self {
        ApiError::BadRequest(msg.into())
    }
    pub fn conflict(msg: impl Into<String>) -> Self {
        ApiError::Conflict(msg.into())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, msg) = match self {
            ApiError::BadRequest(m) => (StatusCode::BAD_REQUEST, m),
            ApiError::Unauthorized => (StatusCode::UNAUTHORIZED, "Authentication required".into()),
            ApiError::InvalidCredentials => (StatusCode::UNAUTHORIZED, "Invalid email or password".into()),
            ApiError::Forbidden => (StatusCode::FORBIDDEN, "You do not have permission to do this".into()),
            ApiError::NotFound => (StatusCode::NOT_FOUND, "Not found".into()),
            ApiError::Conflict(m) => (StatusCode::CONFLICT, m),
            ApiError::Gone => (StatusCode::GONE, "This link is no longer available".into()),
            ApiError::TooMany => (StatusCode::TOO_MANY_REQUESTS, "Too many requests, please try again later".into()),
            ApiError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".into()),
        };
        (status, Json(json!({ "error": msg }))).into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        // Never leak database details to clients.
        tracing::error!("database error: {e}");
        ApiError::Internal
    }
}

impl From<JsonRejection> for ApiError {
    fn from(r: JsonRejection) -> Self {
        ApiError::BadRequest(format!("Invalid request body: {}", r.status().canonical_reason().unwrap_or("bad request")))
    }
}

impl From<QueryRejection> for ApiError {
    fn from(_: QueryRejection) -> Self {
        ApiError::BadRequest("Invalid query parameters".into())
    }
}

#[derive(axum::extract::FromRequest)]
#[from_request(via(axum::Json), rejection(ApiError))]
pub struct ApiJson<T>(pub T);

#[derive(axum::extract::FromRequestParts)]
#[from_request(via(axum::extract::Query), rejection(ApiError))]
pub struct ApiQuery<T>(pub T);
