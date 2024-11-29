use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::IntoResponse;
use metrics::Counter;
use sha3::{Sha3_256, Digest};
use sqlx::PgPool;
use crate::utils::internal_error;



struct  Setting {
    #[allow(dead_code)]
    id:String,
    encrypted_global_api_key: String    
}

