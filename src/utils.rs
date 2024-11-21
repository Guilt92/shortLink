use axum::http::StatusCode;
use metrics::counter;

pub fn internal_error<E>(err: E) -> (StatusCode, String)
where
    E: std::error::Error,
{
    tracing::error!("{}", err);

    //  let  labels = [("error", format!("{}!", err))];

   let _ = counter!("request_error", "error" => format!("{}!", err));

    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}
