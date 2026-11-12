use crate::{
    auth::AuthUser,
    error::{ApiError, ApiJson, ApiQuery, ApiResult},
    state::AppState,
    stats::{self, Scope},
    util::*,
};
use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::json;
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};

pub const STATUS_EXPR: &str = "(case when l.disabled_by_admin or not l.is_active then 'disabled' when l.expires_at is not null and l.expires_at <= now() then 'expired' else 'active' end)";

const SELECT: &str = "select l.id, l.target_url, l.user_id, l.is_active, l.disabled_by_admin, l.expires_at, l.created_at,
    (case when l.disabled_by_admin or not l.is_active then 'disabled' when l.expires_at is not null and l.expires_at <= now() then 'expired' else 'active' end) as status,
    (select count(*) from link_statistics s where s.link_id = l.id)::bigint as clicks,
    d.hostname as domain, u.email as owner_email
    from link l left join domains d on d.id = l.domain_id left join users u on u.id = l.user_id";

#[derive(FromRow)]
pub struct LinkRow {
    id: String,
    target_url: String,
    user_id: Option<i64>,
    is_active: bool,
    disabled_by_admin: bool,
    expires_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    status: String,
    clicks: i64,
    domain: Option<String>,
    owner_email: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkView {
    code: String,
    short_url: String,
    target_url: String,
    clicks: i64,
    status: String,
    is_active: bool,
    disabled_by_admin: bool,
    expires_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    domain: Option<String>,
    owner_id: Option<i64>,
    owner_email: Option<String>,
}

pub fn short_url(state: &AppState, code: &str, domain: &Option<String>) -> String {
    match domain {
        Some(d) => format!("{}://{}/{}", state.cfg.scheme(), d, code),
        None => format!("{}/{}", state.cfg.public_base_url, code),
    }
}

impl LinkRow {
    pub fn view(self, state: &AppState) -> LinkView {
        LinkView {
            short_url: short_url(state, &self.id, &self.domain),
            code: self.id, target_url: self.target_url, clicks: self.clicks, status: self.status,
            is_active: self.is_active, disabled_by_admin: self.disabled_by_admin, expires_at: self.expires_at,
            created_at: self.created_at, domain: self.domain, owner_id: self.user_id, owner_email: self.owner_email,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> { pub items: Vec<T>, pub total: i64, pub page: i64, pub per_page: i64 }

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    pub q: Option<String>,
    pub status: Option<String>,
    pub created_from: Option<NaiveDate>,
    pub created_to: Option<NaiveDate>,
    pub sort: Option<String>,
    pub order: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub user_id: Option<i64>,
    pub domain: Option<String>,
}

pub fn like_escape(q: &str) -> String {
    format!("%{}%", q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"))
}

fn push_filters<'a>(qb: &mut QueryBuilder<'a, Postgres>, q: &'a ListQuery, owner: Option<i64>) {
    qb.push(" where true");
    if let Some(o) = owner { qb.push(" and l.user_id = ").push_bind(o); }
    if let Some(u) = q.user_id { qb.push(" and l.user_id = ").push_bind(u); }
    if let Some(s) = q.q.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let pat = like_escape(s);
        qb.push(" and (l.id ilike ").push_bind(pat.clone()).push(" or l.target_url ilike ").push_bind(pat).push(")");
    }
    if let Some(s) = q.status.as_deref().filter(|s| ["active", "expired", "disabled"].contains(s)) {
        qb.push(" and ").push(STATUS_EXPR).push(" = ").push_bind(s.to_string());
    }
    if let Some(d) = q.created_from { qb.push(" and l.created_at >= ").push_bind(d.and_hms_opt(0, 0, 0).unwrap().and_utc()); }
    if let Some(d) = q.created_to { qb.push(" and l.created_at < ").push_bind((d + chrono::Days::new(1)).and_hms_opt(0, 0, 0).unwrap().and_utc()); }
    if let Some(d) = q.domain.as_deref().filter(|s| !s.is_empty()) { qb.push(" and d.hostname = ").push_bind(d.to_lowercase()); }
}

pub async fn list_links(state: &AppState, q: &ListQuery, owner: Option<i64>) -> ApiResult<Page<LinkView>> {
    let per_page = q.per_page.unwrap_or(20).clamp(1, 100);
    let page = q.page.unwrap_or(1).max(1);
    let col = match q.sort.as_deref() {
        Some("clicks") => "clicks", Some("target") => "l.target_url", Some("code") => "l.id", Some("status") => "status",
        _ => "l.created_at",
    };
    let dir = if q.order.as_deref() == Some("asc") { "asc" } else { "desc" };

    let mut cnt = QueryBuilder::<Postgres>::new("select count(*) from link l left join domains d on d.id = l.domain_id");
    push_filters(&mut cnt, q, owner);
    let total: i64 = cnt.build_query_scalar().fetch_one(&state.db).await?;

    let mut qb = QueryBuilder::<Postgres>::new(SELECT);
    push_filters(&mut qb, q, owner);
    qb.push(format!(" order by {col} {dir}, l.id asc limit "));
    qb.push_bind(per_page).push(" offset ").push_bind((page - 1) * per_page);
    let rows: Vec<LinkRow> = qb.build_query_as().fetch_all(&state.db).await?;
    Ok(Page { items: rows.into_iter().map(|r| r.view(state)).collect(), total, page, per_page })
}

pub async fn fetch_link(state: &AppState, code: &str, owner: Option<i64>) -> ApiResult<LinkRow> {
    let sql = format!("{SELECT} where l.id = $1 and ($2::bigint is null or l.user_id = $2)");
    sqlx::query_as::<_, LinkRow>(&sql).bind(code).bind(owner).fetch_optional(&state.db).await?.ok_or(ApiError::NotFound)
}

pub async fn list(State(state): State<AppState>, user: AuthUser, ApiQuery(q): ApiQuery<ListQuery>) -> ApiResult<Json<Page<LinkView>>> {
    Ok(Json(list_links(&state, &q, Some(user.id)).await?))
}

pub async fn get(State(state): State<AppState>, user: AuthUser, Path(code): Path<String>) -> ApiResult<Json<LinkView>> {
    Ok(Json(fetch_link(&state, &code, Some(user.id)).await?.view(&state)))
}

async fn check_domain(db: &PgPool, domain_id: i64, user_id: i64) -> ApiResult<()> {
    let ok: Option<bool> = sqlx::query_scalar("select verified_at is not null from domains where id = $1 and user_id = $2")
        .bind(domain_id).bind(user_id).fetch_optional(db).await?;
    match ok {
        Some(true) => Ok(()),
        Some(false) => Err(ApiError::bad("This domain has not been verified yet")),
        None => Err(ApiError::bad("Unknown domain")),
    }
}

fn check_expiry(e: &Option<DateTime<Utc>>) -> ApiResult<()> {
    if matches!(e, Some(t) if *t <= Utc::now()) { Err(ApiError::bad("Expiration must be in the future")) } else { Ok(()) }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBody {
    pub target_url: String,
    pub alias: Option<String>,
    pub domain_id: Option<i64>,
    pub expires_at: Option<DateTime<Utc>>,
    pub is_active: Option<bool>,
}

/// Inserts a link, generating a unique code unless an alias is supplied.
pub async fn insert_link(state: &AppState, owner: Option<i64>, b: &CreateBody) -> ApiResult<String> {
    let target = validate_target(&b.target_url, &state.cfg)?;
    check_expiry(&b.expires_at)?;
    if let Some(a) = &b.alias { validate_alias(a)?; }
    if let (Some(uid), Some(did)) = (owner, b.domain_id) { check_domain(&state.db, did, uid).await?; }
    if let Some(uid) = owner {
        let max: i64 = state.setting("max_links_per_user").await.and_then(|v| v.parse().ok()).unwrap_or(1000);
        let n: i64 = sqlx::query_scalar("select count(*) from link where user_id = $1").bind(uid).fetch_one(&state.db).await?;
        if n >= max { return Err(ApiError::conflict(format!("Link limit reached ({max})"))); }
    }
    let attempts = if b.alias.is_some() { 1 } else { 5 };
    for _ in 0..attempts {
        let code = b.alias.clone().unwrap_or_else(generate_code);
        let r = sqlx::query("insert into link (id, target_url, user_id, domain_id, is_active, expires_at) values ($1,$2,$3,$4,$5,$6)")
            .bind(&code).bind(&target).bind(owner).bind(b.domain_id.filter(|_| owner.is_some())).bind(b.is_active.unwrap_or(true)).bind(b.expires_at)
            .execute(&state.db).await;
        match r {
            Ok(_) => return Ok(code),
            Err(sqlx::Error::Database(e)) if e.is_unique_violation() => {
                if b.alias.is_some() { return Err(ApiError::conflict("This alias is already taken")); }
            }
            Err(e) => return Err(e.into()),
        }
    }
    tracing::error!("could not generate a unique link code");
    Err(ApiError::Internal)
}

pub async fn create(State(state): State<AppState>, user: AuthUser, ApiJson(b): ApiJson<CreateBody>) -> ApiResult<(StatusCode, Json<LinkView>)> {
    state.rate_limit(&format!("create:{}", user.id), 120, 3600).await?;
    let code = insert_link(&state, Some(user.id), &b).await?;
    Ok((StatusCode::CREATED, Json(fetch_link(&state, &code, Some(user.id)).await?.view(&state))))
}

fn double_option<'de, T: Deserialize<'de>, D: Deserializer<'de>>(d: D) -> Result<Option<Option<T>>, D::Error> {
    Ok(Some(Option::deserialize(d)?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBody {
    pub target_url: Option<String>,
    pub is_active: Option<bool>,
    #[serde(default, deserialize_with = "double_option")]
    pub expires_at: Option<Option<DateTime<Utc>>>,
    #[serde(default, deserialize_with = "double_option")]
    pub domain_id: Option<Option<i64>>,
}

pub async fn update(State(state): State<AppState>, user: AuthUser, Path(code): Path<String>, ApiJson(b): ApiJson<UpdateBody>) -> ApiResult<Json<LinkView>> {
    fetch_link(&state, &code, Some(user.id)).await?;
    let target = match &b.target_url { Some(t) => Some(validate_target(t, &state.cfg)?), None => None };
    if let Some(Some(e)) = &b.expires_at { check_expiry(&Some(*e))?; }
    if let Some(Some(d)) = b.domain_id { check_domain(&state.db, d, user.id).await?; }
    sqlx::query("update link set target_url = coalesce($1, target_url), is_active = coalesce($2, is_active),
                 expires_at = case when $3 then $4 else expires_at end, domain_id = case when $5 then $6 else domain_id end
                 where id = $7 and user_id = $8")
        .bind(target).bind(b.is_active)
        .bind(b.expires_at.is_some()).bind(b.expires_at.flatten())
        .bind(b.domain_id.is_some()).bind(b.domain_id.flatten())
        .bind(&code).bind(user.id)
        .execute(&state.db).await?;
    Ok(Json(fetch_link(&state, &code, Some(user.id)).await?.view(&state)))
}

pub async fn delete_links(state: &AppState, codes: &[String], owner: Option<i64>) -> ApiResult<u64> {
    let mut tx = state.db.begin().await?;
    let ids: Vec<String> = sqlx::query_scalar("select id from link where id = any($1) and ($2::bigint is null or user_id = $2)")
        .bind(codes).bind(owner).fetch_all(&mut *tx).await?;
    sqlx::query("delete from link_statistics where link_id = any($1)").bind(&ids).execute(&mut *tx).await?;
    let n = sqlx::query("delete from link where id = any($1)").bind(&ids).execute(&mut *tx).await?.rows_affected();
    tx.commit().await?;
    Ok(n)
}

pub async fn delete(State(state): State<AppState>, user: AuthUser, Path(code): Path<String>) -> ApiResult<StatusCode> {
    if delete_links(&state, &[code], Some(user.id)).await? == 0 { return Err(ApiError::NotFound); }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct BulkBody { pub codes: Vec<String>, pub action: String }

pub async fn bulk(State(state): State<AppState>, user: AuthUser, ApiJson(b): ApiJson<BulkBody>) -> ApiResult<Json<serde_json::Value>> {
    if b.codes.is_empty() || b.codes.len() > 100 { return Err(ApiError::bad("Select between 1 and 100 links")); }
    let affected = match b.action.as_str() {
        "delete" => delete_links(&state, &b.codes, Some(user.id)).await?,
        "enable" | "disable" => sqlx::query("update link set is_active = $1 where id = any($2) and user_id = $3")
            .bind(b.action == "enable").bind(&b.codes).bind(user.id).execute(&state.db).await?.rows_affected(),
        _ => return Err(ApiError::bad("Unknown bulk action")),
    };
    Ok(Json(json!({ "affected": affected })))
}

#[derive(Deserialize)]
pub struct StatsQuery { pub days: Option<i64>, pub granularity: Option<String> }

pub async fn link_stats(State(state): State<AppState>, user: AuthUser, Path(code): Path<String>, ApiQuery(q): ApiQuery<StatsQuery>) -> ApiResult<Json<serde_json::Value>> {
    fetch_link(&state, &code, Some(user.id)).await?;
    let days = stats::clamp_days(q.days);
    let scope = Scope { user_id: Some(user.id), code: Some(code) };
    let (clicks, visitors) = stats::window_totals(&state.db, &scope, days as i32, 0).await?;
    Ok(Json(json!({
        "days": days, "clicks": clicks, "uniqueVisitors": visitors,
        "series": stats::series(&state.db, &scope, days, stats::gran(&q.granularity)).await?,
        "referrers": stats::breakdown(&state.db, &scope, days, "referer").await?,
        "devices": stats::breakdown(&state.db, &scope, days, "device").await?,
        "browsers": stats::breakdown(&state.db, &scope, days, "browser").await?,
        "operatingSystems": stats::breakdown(&state.db, &scope, days, "os").await?,
    })))
}

pub async fn qr(State(state): State<AppState>, user: AuthUser, Path(code): Path<String>) -> ApiResult<Response> {
    let link = fetch_link(&state, &code, Some(user.id)).await?;
    let url = short_url(&state, &link.id, &link.domain);
    let svg = qrcode::QrCode::new(url.as_bytes()).map_err(|_| ApiError::Internal)?
        .render::<qrcode::render::svg::Color>().min_dimensions(256, 256).quiet_zone(true).build();
    Ok(([(header::CONTENT_TYPE, "image/svg+xml"), (header::CONTENT_SECURITY_POLICY, "default-src 'none'; style-src 'unsafe-inline'")], svg).into_response())
}

#[derive(Deserialize)]
pub struct OverviewQuery { pub days: Option<i64>, pub granularity: Option<String> }

pub async fn overview(State(state): State<AppState>, user: AuthUser, ApiQuery(q): ApiQuery<OverviewQuery>) -> ApiResult<Json<serde_json::Value>> {
    let days = stats::clamp_days(q.days);
    let scope = Scope { user_id: Some(user.id), code: None };
    let (total, active): (i64, i64) = sqlx::query_as(&format!(
        "select count(*)::bigint, count(*) filter (where {STATUS_EXPR} = 'active')::bigint from link l where l.user_id = $1"))
        .bind(user.id).fetch_one(&state.db).await?;
    let (clicks, visitors) = stats::window_totals(&state.db, &scope, days as i32, 0).await?;
    let (pclicks, pvisitors) = stats::window_totals(&state.db, &scope, (days * 2) as i32, days as i32).await?;
    let recent = list_links(&state, &ListQuery { per_page: Some(5), ..Default::default() }, Some(user.id)).await?;
    Ok(Json(json!({
        "days": days, "totalLinks": total, "activeLinks": active,
        "clicks": clicks, "previousClicks": pclicks, "uniqueVisitors": visitors, "previousUniqueVisitors": pvisitors,
        "series": stats::series(&state.db, &scope, days, stats::gran(&q.granularity)).await?,
        "recentLinks": recent.items,
    })))
}

/// Account-wide analytics (all of the user's links).
pub async fn account_analytics(State(state): State<AppState>, user: AuthUser, ApiQuery(q): ApiQuery<StatsQuery>) -> ApiResult<Json<serde_json::Value>> {
    let days = stats::clamp_days(q.days);
    let scope = Scope { user_id: Some(user.id), code: None };
    let (clicks, visitors) = stats::window_totals(&state.db, &scope, days as i32, 0).await?;
    let (pclicks, _) = stats::window_totals(&state.db, &scope, (days * 2) as i32, days as i32).await?;
    let top: Vec<(String, String, i64)> = sqlx::query_as(
        "select l.id, l.target_url, count(*)::bigint from link_statistics s join link l on l.id = s.link_id
         where l.user_id = $2 and s.created_at >= now() - make_interval(days => $1) group by l.id, l.target_url order by 3 desc, 1 limit 10")
        .bind(days as i32).bind(user.id).fetch_all(&state.db).await?;
    Ok(Json(json!({
        "days": days, "clicks": clicks, "previousClicks": pclicks, "uniqueVisitors": visitors,
        "series": stats::series(&state.db, &scope, days, stats::gran(&q.granularity)).await?,
        "topLinks": top.into_iter().map(|(c, t, n)| json!({"code": c, "targetUrl": t, "clicks": n})).collect::<Vec<_>>(),
        "referrers": stats::breakdown(&state.db, &scope, days, "referer").await?,
        "devices": stats::breakdown(&state.db, &scope, days, "device").await?,
        "browsers": stats::breakdown(&state.db, &scope, days, "browser").await?,
        "operatingSystems": stats::breakdown(&state.db, &scope, days, "os").await?,
    })))
}
