use crate::{
    auth::{AdminUser, AuthUser},
    error::{ApiError, ApiJson, ApiResult},
    state::AppState,
    util::*,
};
use axum::{extract::{Path, State}, http::StatusCode, Json};
use chrono::{DateTime, Utc};
use hickory_resolver::TokioResolver;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;

#[derive(FromRow)]
pub struct DomainRow {
    id: i64,
    hostname: String,
    verify_token: String,
    verified_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    owner_email: Option<String>,
    link_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainView {
    id: i64,
    hostname: String,
    verified: bool,
    verified_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    owner_email: Option<String>,
    link_count: i64,
    dns: serde_json::Value,
}

const SELECT: &str = "select d.id, d.hostname, d.verify_token, d.verified_at, d.created_at, u.email as owner_email,
    (select count(*) from link l where l.domain_id = d.id)::bigint as link_count
    from domains d join users u on u.id = d.user_id";

fn view(state: &AppState, r: DomainRow) -> DomainView {
    let dns = json!({
        "txt": { "type": "TXT", "name": format!("_shortlink-verify.{}", r.hostname), "value": r.verify_token },
        "route": { "type": "CNAME or A", "name": r.hostname, "value": state.cfg.base_host(),
                   "note": "Point the domain at this service (CNAME to the host above, or an A/AAAA record to its IP address) and terminate TLS for it in your reverse proxy." },
    });
    DomainView { id: r.id, hostname: r.hostname, verified: r.verified_at.is_some(), verified_at: r.verified_at, created_at: r.created_at, owner_email: r.owner_email, link_count: r.link_count, dns }
}

pub async fn list(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<Vec<DomainView>>> {
    let rows: Vec<DomainRow> = sqlx::query_as(&format!("{SELECT} where d.user_id = $1 order by d.created_at desc")).bind(user.id).fetch_all(&state.db).await?;
    Ok(Json(rows.into_iter().map(|r| view(&state, r)).collect()))
}

#[derive(Deserialize)]
pub struct AddBody { pub hostname: String }

pub async fn add(State(state): State<AppState>, user: AuthUser, ApiJson(b): ApiJson<AddBody>) -> ApiResult<(StatusCode, Json<DomainView>)> {
    state.rate_limit(&format!("domain-add:{}", user.id), 20, 3600).await?;
    let host = validate_hostname(&b.hostname)?;
    if host == state.cfg.base_host() { return Err(ApiError::bad("This is the service's own domain")); }
    let count: i64 = sqlx::query_scalar("select count(*) from domains where user_id = $1").bind(user.id).fetch_one(&state.db).await?;
    if count >= 20 { return Err(ApiError::conflict("Domain limit reached (20)")); }
    let id: Result<i64, sqlx::Error> = sqlx::query_scalar("insert into domains (user_id, hostname, verify_token) values ($1,$2,$3) returning id")
        .bind(user.id).bind(&host).bind(random_token()[..32].to_string()).fetch_one(&state.db).await;
    let id = match id {
        Ok(i) => i,
        Err(sqlx::Error::Database(e)) if e.is_unique_violation() => return Err(ApiError::conflict("You already added this domain")),
        Err(e) => return Err(e.into()),
    };
    let r: DomainRow = sqlx::query_as(&format!("{SELECT} where d.id = $1")).bind(id).fetch_one(&state.db).await?;
    Ok((StatusCode::CREATED, Json(view(&state, r))))
}

pub async fn verify(State(state): State<AppState>, user: AuthUser, Path(id): Path<i64>) -> ApiResult<Json<DomainView>> {
    state.rate_limit(&format!("domain-verify:{}", user.id), 30, 3600).await?;
    let r: DomainRow = sqlx::query_as(&format!("{SELECT} where d.id = $1 and d.user_id = $2")).bind(id).bind(user.id)
        .fetch_optional(&state.db).await?.ok_or(ApiError::NotFound)?;
    if r.verified_at.is_none() {
        let name = format!("_shortlink-verify.{}.", r.hostname);
        let resolver = TokioResolver::builder_tokio().and_then(|b| b.build()).map_err(|e| { tracing::error!("resolver: {e}"); ApiError::Internal })?;
        let found = match tokio::time::timeout(std::time::Duration::from_secs(5), resolver.txt_lookup(name)).await {
            Ok(Ok(txt)) => txt.answers().iter().any(|rec| matches!(&rec.data, hickory_resolver::proto::rr::RData::TXT(t) if t.to_string().trim() == r.verify_token)),
            _ => false,
        };
        if !found {
            return Err(ApiError::bad("The TXT record was not found yet. DNS changes can take a while to propagate."));
        }
        match sqlx::query("update domains set verified_at = now() where id = $1").bind(id).execute(&state.db).await {
            Ok(_) => {}
            Err(sqlx::Error::Database(e)) if e.is_unique_violation() => {
                return Err(ApiError::conflict("This domain is already verified by another account"));
            }
            Err(e) => return Err(e.into()),
        }
        state.audit(Some(user.id), "domain.verify", "domain", &id.to_string(), json!({ "hostname": r.hostname })).await;
    }
    let r: DomainRow = sqlx::query_as(&format!("{SELECT} where d.id = $1")).bind(id).fetch_one(&state.db).await?;
    Ok(Json(view(&state, r)))
}

pub async fn remove(State(state): State<AppState>, user: AuthUser, Path(id): Path<i64>) -> ApiResult<StatusCode> {
    let n = sqlx::query("delete from domains where id = $1 and user_id = $2").bind(id).bind(user.id).execute(&state.db).await?.rows_affected();
    if n == 0 { return Err(ApiError::NotFound); }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn admin_list(State(state): State<AppState>, _a: AdminUser) -> ApiResult<Json<Vec<DomainView>>> {
    let rows: Vec<DomainRow> = sqlx::query_as(&format!("{SELECT} order by d.created_at desc limit 500")).fetch_all(&state.db).await?;
    Ok(Json(rows.into_iter().map(|r| view(&state, r)).collect()))
}

pub async fn admin_remove(State(state): State<AppState>, AdminUser(a): AdminUser, Path(id): Path<i64>) -> ApiResult<StatusCode> {
    let n = sqlx::query("delete from domains where id = $1").bind(id).execute(&state.db).await?.rows_affected();
    if n == 0 { return Err(ApiError::NotFound); }
    state.audit(Some(a.id), "domain.delete", "domain", &id.to_string(), json!({})).await;
    Ok(StatusCode::NO_CONTENT)
}
