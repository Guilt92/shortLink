use axum::http::StatusCode;
use metrics::increment_counter;


pub fn internal_error<E>(err: E) -> (StatusCode , String)
where 
E  : std::error::Error,
{
    tracing::error!("{}", err);

    let lable = [("error" , format!("{}" , err))];

    increment_counter!("request_error" , &lable);

    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())

}