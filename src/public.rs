use crate::{
    auth::ClientIp,
    error::{ApiError, ApiJson, ApiResult},
    links::{insert_link, CreateBody},
    state::AppState,
    util::*,
};
use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;
use url::Url;

pub async fn health() -> impl IntoResponse {
    (StatusCode::OK, "Service is healthy")
}

pub async fn ready(State(state): State<AppState>) -> impl IntoResponse {
    match sqlx::query("select 1").execute(&state.db).await {
        Ok(_) => (StatusCode::OK, "ready"),
        Err(e) => {
            tracing::error!("readiness check failed: {e}");
            (StatusCode::SERVICE_UNAVAILABLE, "database unavailable")
        }
    }
}

struct Target {
    url: String,
    is_active: bool,
    disabled_by_admin: bool,
    expires_at: Option<DateTime<Utc>>,
}

pub async fn redirect(State(state): State<AppState>, ClientIp(ip): ClientIp, method: Method, Path(code): Path<String>, headers: HeaderMap) -> ApiResult<Response> {
    state.rate_limit_local(&format!("redirect:{ip}"), 600, 60)?;
    let row: Option<(String, bool, bool, Option<DateTime<Utc>>)> =
        tokio::time::timeout(std::time::Duration::from_secs(3),
            sqlx::query_as("select target_url, is_active, disabled_by_admin, expires_at from link where id = $1").bind(&code).fetch_optional(&state.db))
            .await.map_err(|_| { tracing::error!("redirect lookup timed out"); ApiError::Unavailable })??;
    let t = row.map(|(url, a, d, e)| Target { url, is_active: a, disabled_by_admin: d, expires_at: e }).ok_or(ApiError::NotFound)?;
    if !t.is_active || t.disabled_by_admin || matches!(t.expires_at, Some(e) if e <= Utc::now()) {
        return Err(ApiError::Gone);
    }
    // Defence in depth: legacy rows may pre-date validation.
    let parsed = Url::parse(&t.url).ok().filter(|u| u.scheme() == "http" || u.scheme() == "https").ok_or(ApiError::NotFound)?;
    let location = HeaderValue::from_str(parsed.as_str()).map_err(|_| ApiError::Internal)?;

    if method == Method::GET {
        let ua = headers.get(header::USER_AGENT).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
        let referer = headers.get(header::REFERER).and_then(|v| v.to_str().ok()).map(|s| s.chars().take(2048).collect::<String>());
        let referer_host = referer.as_deref().and_then(|r| Url::parse(r).ok()).and_then(|u| u.host_str().map(str::to_string));
        let parsed_ua = parse_user_agent(&ua);
        let visitor = sha256_hex(&format!("{}|{}|{}", state.cfg.visitor_salt, ip, ua))[..32].to_string();
        let db = state.db.clone();
        // Don't make the visitor wait for the statistics write.
        tokio::spawn(async move {
            let r = tokio::time::timeout(std::time::Duration::from_secs(3),
                sqlx::query("insert into link_statistics (link_id, referer, user_agent, referer_host, device, browser, os, visitor_hash) values ($1,$2,$3,$4,$5,$6,$7,$8)")
                    .bind(code).bind(referer).bind(ua.chars().take(512).collect::<String>()).bind(referer_host)
                    .bind(parsed_ua.device).bind(parsed_ua.browser).bind(parsed_ua.os).bind(visitor)
                    .execute(&db)).await;
            match r {
                Err(_) => tracing::error!("click statistic write timed out"),
                Ok(Err(e)) => tracing::error!("click statistic write failed: {e}"),
                _ => {}
            }
        });
    }
    Response::builder()
        .status(StatusCode::TEMPORARY_REDIRECT)
        // Must not be cached, otherwise repeat clicks never reach us and are not counted.
        .header(header::CACHE_CONTROL, "private, no-store")
        .header(header::LOCATION, location)
        .body(Body::empty())
        .map_err(|_| ApiError::Internal)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyCreate { pub target_url: String }

/// Backwards-compatible anonymous creation endpoint (`POST /create`).
pub async fn create_anonymous(State(state): State<AppState>, ClientIp(ip): ClientIp, ApiJson(b): ApiJson<LegacyCreate>) -> ApiResult<(StatusCode, Json<serde_json::Value>)> {
    state.rate_limit(&format!("anon-create:{ip}"), 30, 600).await?;
    if !state.setting_bool("allow_anonymous_links", true).await {
        return Err(ApiError::Forbidden);
    }
    let body = CreateBody { target_url: b.target_url, alias: None, domain_id: None, expires_at: None, is_active: None };
    let code = insert_link(&state, None, &body).await?;
    let target: String = sqlx::query_scalar("select target_url from link where id = $1").bind(&code).fetch_one(&state.db).await?;
    Ok((StatusCode::OK, Json(json!({ "id": code, "targetUrl": target, "shortUrl": format!("{}/{}", state.cfg.public_base_url, code) }))))
}

#[derive(Deserialize)]
pub struct ReportBody { pub url: String, pub reason: String, pub details: Option<String>, pub reporter: Option<String> }

pub async fn report(State(state): State<AppState>, ClientIp(ip): ClientIp, ApiJson(b): ApiJson<ReportBody>) -> ApiResult<StatusCode> {
    state.rate_limit(&format!("report:{ip}"), 5, 3600).await?;
    if !["spam", "phishing", "malware", "illegal", "other"].contains(&b.reason.as_str()) {
        return Err(ApiError::bad("Unknown reason"));
    }
    let url = Url::parse(b.url.trim()).map_err(|_| ApiError::bad("Enter the full short URL you want to report"))?;
    if url.scheme() != "http" && url.scheme() != "https" { return Err(ApiError::bad("Enter the full short URL you want to report")); }
    let code = url.path().trim_matches('/').to_string();
    let link_id: Option<String> = if code.is_empty() { None } else {
        sqlx::query_scalar("select id from link where id = $1").bind(&code).fetch_optional(&state.db).await?
    };
    let details = b.details.map(|d| d.chars().take(2000).collect::<String>());
    let reporter = b.reporter.map(|r| r.trim().chars().take(254).collect::<String>()).filter(|r| !r.is_empty());
    sqlx::query("insert into abuse_reports (link_id, reported_url, reporter, reason, details) values ($1,$2,$3,$4,$5)")
        .bind(link_id).bind(url.as_str().chars().take(2048).collect::<String>()).bind(reporter).bind(b.reason).bind(details)
        .execute(&state.db).await?;
    Ok(StatusCode::CREATED)
}
