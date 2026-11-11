pub mod admin;
pub mod auth;
pub mod config;
pub mod domains;
pub mod error;
pub mod frontend;
pub mod links;
pub mod public;
pub mod ratelimit;
pub mod state;
pub mod stats;
pub mod util;

use axum::{
    extract::{DefaultBodyLimit, Request},
    http::{header, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post},
    Json, Router,
};
use state::AppState;
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

/// State-changing API calls must carry a custom header. Browsers cannot attach it
/// cross-site without a CORS preflight (which we never grant), which blocks CSRF.
async fn csrf_guard(req: Request, next: Next) -> Response {
    let safe = matches!(*req.method(), Method::GET | Method::HEAD | Method::OPTIONS);
    if !safe && !req.headers().contains_key("x-sl-csrf") {
        return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Missing CSRF header" }))).into_response();
    }
    next.run(req).await
}

async fn security_headers(req: Request, next: Next) -> Response {
    let mut res = next.run(req).await;
    let h = res.headers_mut();
    h.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    h.insert("x-frame-options", HeaderValue::from_static("DENY"));
    h.insert(header::REFERRER_POLICY, HeaderValue::from_static("strict-origin-when-cross-origin"));
    if !h.contains_key(header::CONTENT_SECURITY_POLICY) {
        h.insert(header::CONTENT_SECURITY_POLICY, HeaderValue::from_static(
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"));
    }
    res
}

pub fn build_app(state: AppState) -> Router {
    use admin as a;
    let api = Router::new()
        .route("/auth/register", post(auth::register))
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/auth/forgot-password", post(auth::forgot_password))
        .route("/auth/reset-password", post(auth::reset_password))
        .route("/me", get(auth::me).patch(auth::update_me))
        .route("/me/password", post(auth::change_password))
        .route("/reports", post(public::report))
        .route("/stats/overview", get(links::overview))
        .route("/stats/analytics", get(links::account_analytics))
        .route("/links", get(links::list).post(links::create))
        .route("/links/bulk", post(links::bulk))
        .route("/links/:code", get(links::get).patch(links::update).delete(links::delete))
        .route("/links/:code/stats", get(links::link_stats))
        .route("/links/:code/qr.svg", get(links::qr))
        .route("/domains", get(domains::list).post(domains::add))
        .route("/domains/:id", delete(domains::remove))
        .route("/domains/:id/verify", post(domains::verify))
        .route("/admin/overview", get(a::overview))
        .route("/admin/analytics", get(a::analytics))
        .route("/admin/users", get(a::users))
        .route("/admin/users/:id", get(a::user_detail).patch(a::update_user).delete(a::delete_user))
        .route("/admin/links", get(a::links))
        .route("/admin/links/:code", patch(a::set_link_disabled).delete(a::delete_link))
        .route("/admin/domains", get(domains::admin_list))
        .route("/admin/domains/:id", delete(domains::admin_remove))
        .route("/admin/reports", get(a::reports))
        .route("/admin/reports/:id", patch(a::resolve_report))
        .route("/admin/audit", get(a::audit))
        .route("/admin/settings", get(a::get_settings).put(a::put_settings))
        .fallback(|| async { error::ApiError::NotFound })
        .layer(middleware::from_fn(csrf_guard));

    let dist = state.cfg.frontend_dist.clone();
    let spa = ServeDir::new(&dist).fallback(ServeFile::new(format!("{dist}/index.html")));

    Router::new()
        .route("/", get(frontend::index))
        .nest_service("/static", ServeDir::new(&state.cfg.static_dir))
        .nest_service("/app", spa)
        .nest("/api", api)
        .route("/create", post(public::create_anonymous))
        .route("/health", get(public::health))
        .route("/ready", get(public::ready))
        .route("/:code", get(public::redirect))
        .layer(DefaultBodyLimit::max(64 * 1024))
        .layer(middleware::from_fn(security_headers))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
