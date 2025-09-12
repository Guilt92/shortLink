use axum::http::StatusCode;
use metrics::counter;

pub fn internal_error<E>(err: E) -> (StatusCode, String)
where
    E: std::error::Error,
{
    tracing::error!("{}", err);

    counter!("request_error", "error" => format!("{}!", err));

    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}
