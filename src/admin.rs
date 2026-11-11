use crate::{
    auth::AdminUser,
    error::{ApiError, ApiJson, ApiQuery, ApiResult},
    links::{self, like_escape, ListQuery, Page},
    state::AppState,
    stats::{self, Scope},
};
use axum::{extract::{Path, State}, http::StatusCode, Json};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{FromRow, Postgres, QueryBuilder};

#[derive(Deserialize)]
pub struct RangeQuery { pub days: Option<i64>, pub granularity: Option<String> }

pub async fn overview(State(state): State<AppState>, _a: AdminUser, ApiQuery(q): ApiQuery<RangeQuery>) -> ApiResult<Json<serde_json::Value>> {
    let days = stats::clamp_days(q.days);
    let g = stats::gran(&q.granularity);
    let db = &state.db;
    let (users, active_users, links, active_links, clicks, pending): (i64, i64, i64, i64, i64, i64) = sqlx::query_as(&format!(
        "select (select count(*) from users),
                (select count(*) from users where status = 'active' and last_login_at > now() - interval '30 days'),
                (select count(*) from link),
                (select count(*) from link l where {} = 'active'),
                (select count(*) from link_statistics),
                (select count(*) from abuse_reports where status = 'pending')", links::STATUS_EXPR)).fetch_one(db).await?;
    let top_users: Vec<(String, i64)> = sqlx::query_as(
        "select u.email, count(*)::bigint from link l join users u on u.id = l.user_id group by u.email order by 2 desc, 1 limit 5").fetch_all(db).await?;
    let anon: i64 = sqlx::query_scalar("select count(*) from link where user_id is null").fetch_one(db).await?;
    let recent: Vec<(String, String, DateTime<Utc>)> = sqlx::query_as(
        "(select 'user' as kind, 'New user ' || email, created_at from users order by created_at desc limit 8)
         union all (select 'link', 'New link /' || id, created_at from link order by created_at desc limit 8)
         union all (select 'report', 'Abuse report (' || reason || ')', created_at from abuse_reports order by created_at desc limit 8)
         union all (select 'audit', action, created_at from audit_logs where action not in ('user.register') order by created_at desc limit 8)
         order by 3 desc limit 15").fetch_all(db).await?;
    Ok(Json(json!({
        "days": days,
        "totals": { "users": users, "activeUsers": active_users, "links": links, "activeLinks": active_links, "clicks": clicks, "pendingReports": pending },
        "registrations": stats::created_series(db, "users", days, g).await?.into_iter().map(|(b, n)| json!({"bucket": b, "count": n})).collect::<Vec<_>>(),
        "linkCreations": stats::created_series(db, "link", days, g).await?.into_iter().map(|(b, n)| json!({"bucket": b, "count": n})).collect::<Vec<_>>(),
        "clickSeries": stats::series(db, &Scope::default(), days, g).await?,
        "usage": { "topUsers": top_users.into_iter().map(|(e, n)| json!({"name": e, "count": n})).collect::<Vec<_>>(), "anonymousLinks": anon },
        "recentActivity": recent.into_iter().map(|(k, l, at)| json!({"kind": k, "label": l, "at": at})).collect::<Vec<_>>(),
    })))
}

pub async fn analytics(State(state): State<AppState>, _a: AdminUser, ApiQuery(q): ApiQuery<RangeQuery>) -> ApiResult<Json<serde_json::Value>> {
    let days = stats::clamp_days(q.days);
    let scope = Scope::default();
    let db = &state.db;
    let (clicks, visitors) = stats::window_totals(db, &scope, days as i32, 0).await?;
    let (pclicks, _) = stats::window_totals(db, &scope, (days * 2) as i32, days as i32).await?;
    let top: Vec<(String, String, i64)> = sqlx::query_as(
        "select l.id, l.target_url, count(*)::bigint from link_statistics s join link l on l.id = s.link_id
         where s.created_at >= now() - make_interval(days => $1) group by l.id, l.target_url order by 3 desc, 1 limit 10")
        .bind(days as i32).fetch_all(db).await?;
    Ok(Json(json!({
        "days": days, "clicks": clicks, "previousClicks": pclicks, "uniqueVisitors": visitors,
        "series": stats::series(db, &scope, days, stats::gran(&q.granularity)).await?,
        "topLinks": top.into_iter().map(|(c, t, n)| json!({"code": c, "targetUrl": t, "clicks": n})).collect::<Vec<_>>(),
        "referrers": stats::breakdown(db, &scope, days, "referer").await?,
        "devices": stats::breakdown(db, &scope, days, "device").await?,
        "browsers": stats::breakdown(db, &scope, days, "browser").await?,
        "operatingSystems": stats::breakdown(db, &scope, days, "os").await?,
    })))
}

// ---------- users ----------

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UserQuery { q: Option<String>, role: Option<String>, status: Option<String>, sort: Option<String>, order: Option<String>, page: Option<i64>, per_page: Option<i64> }

#[derive(FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserRow {
    id: i64, email: String, name: String, role: String, status: String,
    created_at: DateTime<Utc>, last_login_at: Option<DateTime<Utc>>, link_count: i64,
}

const USER_SELECT: &str = "select u.id, u.email, u.name, u.role, u.status, u.created_at, u.last_login_at,
    (select count(*) from link l where l.user_id = u.id)::bigint as link_count from users u";

pub async fn users(State(state): State<AppState>, _a: AdminUser, ApiQuery(q): ApiQuery<UserQuery>) -> ApiResult<Json<Page<UserRow>>> {
    let per_page = q.per_page.unwrap_or(20).clamp(1, 100);
    let page = q.page.unwrap_or(1).max(1);
    fn filters<'a>(qb: &mut QueryBuilder<'a, Postgres>, q: &'a UserQuery) {
        qb.push(" where true");
        if let Some(s) = q.q.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            let p = like_escape(s);
            qb.push(" and (u.email ilike ").push_bind(p.clone()).push(" or u.name ilike ").push_bind(p).push(")");
        }
        if let Some(r) = q.role.as_deref().filter(|r| ["user", "admin", "super_admin"].contains(r)) { qb.push(" and u.role = ").push_bind(r.to_string()); }
        if let Some(s) = q.status.as_deref().filter(|s| ["active", "suspended"].contains(s)) { qb.push(" and u.status = ").push_bind(s.to_string()); }
    }
    let mut c = QueryBuilder::<Postgres>::new("select count(*) from users u");
    filters(&mut c, &q);
    let total: i64 = c.build_query_scalar().fetch_one(&state.db).await?;
    let col = match q.sort.as_deref() { Some("email") => "u.email", Some("name") => "u.name", Some("links") => "link_count", Some("lastLogin") => "u.last_login_at", Some("role") => "u.role", _ => "u.created_at" };
    let dir = if q.order.as_deref() == Some("asc") { "asc" } else { "desc" };
    let mut qb = QueryBuilder::<Postgres>::new(USER_SELECT);
    filters(&mut qb, &q);
    qb.push(format!(" order by {col} {dir} nulls last, u.id limit ")).push_bind(per_page).push(" offset ").push_bind((page - 1) * per_page);
    let items: Vec<UserRow> = qb.build_query_as().fetch_all(&state.db).await?;
    Ok(Json(Page { items, total, page, per_page }))
}

pub async fn user_detail(State(state): State<AppState>, _a: AdminUser, Path(id): Path<i64>) -> ApiResult<Json<serde_json::Value>> {
    let u: UserRow = sqlx::query_as(&format!("{USER_SELECT} where u.id = $1")).bind(id).fetch_optional(&state.db).await?.ok_or(ApiError::NotFound)?;
    let clicks: i64 = sqlx::query_scalar("select count(*) from link_statistics s join link l on l.id = s.link_id where l.user_id = $1").bind(id).fetch_one(&state.db).await?;
    let domains: i64 = sqlx::query_scalar("select count(*) from domains where user_id = $1").bind(id).fetch_one(&state.db).await?;
    let recent = links::list_links(&state, &ListQuery { per_page: Some(10), ..Default::default() }, Some(id)).await?;
    let activity: Vec<(String, DateTime<Utc>)> = sqlx::query_as("select action, created_at from audit_logs where actor_id = $1 or (target_type = 'user' and target_id = $2) order by created_at desc limit 10")
        .bind(id).bind(id.to_string()).fetch_all(&state.db).await?;
    Ok(Json(json!({
        "user": u, "usage": { "links": u.link_count, "clicks": clicks, "domains": domains },
        "recentLinks": recent.items,
        "activity": activity.into_iter().map(|(a, at)| json!({"action": a, "at": at})).collect::<Vec<_>>(),
    })))
}

#[derive(Deserialize)]
pub struct UpdateUser { name: Option<String>, role: Option<String>, status: Option<String> }

pub async fn update_user(State(state): State<AppState>, AdminUser(actor): AdminUser, Path(id): Path<i64>, ApiJson(b): ApiJson<UpdateUser>) -> ApiResult<Json<UserRow>> {
    let (cur_role,): (String,) = sqlx::query_as("select role from users where id = $1").bind(id).fetch_optional(&state.db).await?.ok_or(ApiError::NotFound)?;
    let actor_super = actor.role == "super_admin";
    // Plain admins may never touch super admins.
    if cur_role == "super_admin" && !actor_super { return Err(ApiError::Forbidden); }
    if let Some(r) = &b.role {
        if !["user", "admin", "super_admin"].contains(&r.as_str()) { return Err(ApiError::bad("Unknown role")); }
        if !actor_super { return Err(ApiError::Forbidden); }
        if id == actor.id && r != &actor.role { return Err(ApiError::bad("You cannot change your own role")); }
    }
    if let Some(s) = &b.status {
        if !["active", "suspended"].contains(&s.as_str()) { return Err(ApiError::bad("Unknown status")); }
        if id == actor.id { return Err(ApiError::bad("You cannot suspend your own account")); }
    }
    let name = match &b.name { Some(n) => { let n = n.trim(); if n.is_empty() || n.chars().count() > 100 { return Err(ApiError::bad("Invalid name")); } Some(n.to_string()) } None => None };
    sqlx::query("update users set name = coalesce($1, name), role = coalesce($2, role), status = coalesce($3, status) where id = $4")
        .bind(name).bind(&b.role).bind(&b.status).bind(id).execute(&state.db).await?;
    if b.status.as_deref() == Some("suspended") || b.role.is_some() {
        sqlx::query("delete from sessions where user_id = $1").bind(id).execute(&state.db).await?;
    }
    state.audit(Some(actor.id), "user.update", "user", &id.to_string(), json!({ "name": b.name.is_some(), "role": b.role, "status": b.status })).await;
    Ok(Json(sqlx::query_as(&format!("{USER_SELECT} where u.id = $1")).bind(id).fetch_one(&state.db).await?))
}

pub async fn delete_user(State(state): State<AppState>, AdminUser(actor): AdminUser, Path(id): Path<i64>) -> ApiResult<StatusCode> {
    if actor.role != "super_admin" { return Err(ApiError::Forbidden); }
    if id == actor.id { return Err(ApiError::bad("You cannot delete your own account")); }
    let mut tx = state.db.begin().await?;
    sqlx::query("delete from link_statistics where link_id in (select id from link where user_id = $1)").bind(id).execute(&mut *tx).await?;
    let n = sqlx::query("delete from users where id = $1").bind(id).execute(&mut *tx).await?.rows_affected();
    tx.commit().await?;
    if n == 0 { return Err(ApiError::NotFound); }
    state.audit(Some(actor.id), "user.delete", "user", &id.to_string(), json!({})).await;
    Ok(StatusCode::NO_CONTENT)
}

// ---------- links ----------

pub async fn links(State(state): State<AppState>, _a: AdminUser, ApiQuery(q): ApiQuery<ListQuery>) -> ApiResult<Json<Page<links::LinkView>>> {
    Ok(Json(links::list_links(&state, &q, None).await?))
}

#[derive(Deserialize)]
pub struct DisableBody { disabled: bool }

pub async fn set_link_disabled(State(state): State<AppState>, AdminUser(a): AdminUser, Path(code): Path<String>, ApiJson(b): ApiJson<DisableBody>) -> ApiResult<Json<links::LinkView>> {
    let n = sqlx::query("update link set disabled_by_admin = $1 where id = $2").bind(b.disabled).bind(&code).execute(&state.db).await?.rows_affected();
    if n == 0 { return Err(ApiError::NotFound); }
    state.audit(Some(a.id), if b.disabled { "link.disable" } else { "link.enable" }, "link", &code, json!({})).await;
    Ok(Json(links::fetch_link(&state, &code, None).await?.view(&state)))
}

pub async fn delete_link(State(state): State<AppState>, AdminUser(a): AdminUser, Path(code): Path<String>) -> ApiResult<StatusCode> {
    if links::delete_links(&state, &[code.clone()], None).await? == 0 { return Err(ApiError::NotFound); }
    state.audit(Some(a.id), "link.delete", "link", &code, json!({})).await;
    Ok(StatusCode::NO_CONTENT)
}

// ---------- abuse reports ----------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportQuery { status: Option<String>, page: Option<i64>, per_page: Option<i64> }

#[derive(FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportRow {
    id: i64, link_id: Option<String>, reported_url: String, reporter: Option<String>, reason: String, details: Option<String>,
    status: String, assigned_to: Option<i64>, assigned_email: Option<String>, created_at: DateTime<Utc>, resolved_at: Option<DateTime<Utc>>,
    link_status: Option<String>, target_url: Option<String>,
}

pub async fn reports(State(state): State<AppState>, _a: AdminUser, ApiQuery(q): ApiQuery<ReportQuery>) -> ApiResult<Json<Page<ReportRow>>> {
    let per_page = q.per_page.unwrap_or(20).clamp(1, 100);
    let page = q.page.unwrap_or(1).max(1);
    let status = q.status.filter(|s| ["pending", "resolved", "rejected"].contains(&s.as_str()));
    let total: i64 = sqlx::query_scalar("select count(*) from abuse_reports where ($1::text is null or status = $1)").bind(&status).fetch_one(&state.db).await?;
    let items: Vec<ReportRow> = sqlx::query_as(&format!(
        "select r.id, r.link_id, r.reported_url, r.reporter, r.reason, r.details, r.status, r.assigned_to, a.email as assigned_email, r.created_at, r.resolved_at,
                (case when l.id is null then null when l.disabled_by_admin or not l.is_active then 'disabled' when l.expires_at is not null and l.expires_at <= now() then 'expired' else 'active' end) as link_status,
                l.target_url
         from abuse_reports r left join users a on a.id = r.assigned_to left join link l on l.id = r.link_id
         where ($1::text is null or r.status = $1) order by (r.status = 'pending') desc, r.created_at desc limit $2 offset $3"))
        .bind(&status).bind(per_page).bind((page - 1) * per_page).fetch_all(&state.db).await?;
    Ok(Json(Page { items, total, page, per_page }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveBody { status: String, #[serde(default)] disable_link: bool }

pub async fn resolve_report(State(state): State<AppState>, AdminUser(a): AdminUser, Path(id): Path<i64>, ApiJson(b): ApiJson<ResolveBody>) -> ApiResult<StatusCode> {
    if !["resolved", "rejected"].contains(&b.status.as_str()) { return Err(ApiError::bad("Status must be resolved or rejected")); }
    let row: Option<(Option<String>, String)> = sqlx::query_as("select link_id, status from abuse_reports where id = $1").bind(id).fetch_optional(&state.db).await?;
    let (link_id, cur) = row.ok_or(ApiError::NotFound)?;
    if cur != "pending" { return Err(ApiError::conflict("This report has already been handled")); }
    sqlx::query("update abuse_reports set status = $1, assigned_to = $2, resolved_at = now() where id = $3").bind(&b.status).bind(a.id).bind(id).execute(&state.db).await?;
    if b.disable_link {
        if let Some(l) = &link_id {
            sqlx::query("update link set disabled_by_admin = true where id = $1").bind(l).execute(&state.db).await?;
            state.audit(Some(a.id), "link.disable", "link", l, json!({ "reportId": id })).await;
        }
    }
    state.audit(Some(a.id), &format!("report.{}", b.status), "report", &id.to_string(), json!({ "disableLink": b.disable_link })).await;
    Ok(StatusCode::NO_CONTENT)
}

// ---------- audit + settings ----------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditQuery { q: Option<String>, page: Option<i64>, per_page: Option<i64> }

#[derive(FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditRow { id: i64, actor_id: Option<i64>, actor_email: Option<String>, action: String, target_type: Option<String>, target_id: Option<String>, details: Option<serde_json::Value>, created_at: DateTime<Utc> }

pub async fn audit(State(state): State<AppState>, _a: AdminUser, ApiQuery(q): ApiQuery<AuditQuery>) -> ApiResult<Json<Page<AuditRow>>> {
    let per_page = q.per_page.unwrap_or(25).clamp(1, 100);
    let page = q.page.unwrap_or(1).max(1);
    let pat = q.q.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(like_escape);
    let total: i64 = sqlx::query_scalar("select count(*) from audit_logs where ($1::text is null or action ilike $1 or target_id ilike $1)").bind(&pat).fetch_one(&state.db).await?;
    let items: Vec<AuditRow> = sqlx::query_as(
        "select a.id, a.actor_id, u.email as actor_email, a.action, a.target_type, a.target_id, a.details, a.created_at
         from audit_logs a left join users u on u.id = a.actor_id
         where ($1::text is null or a.action ilike $1 or a.target_id ilike $1) order by a.created_at desc, a.id desc limit $2 offset $3")
        .bind(&pat).bind(per_page).bind((page - 1) * per_page).fetch_all(&state.db).await?;
    Ok(Json(Page { items, total, page, per_page }))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings { allow_registration: bool, allow_anonymous_links: bool, max_links_per_user: i64 }

async fn load_settings(state: &AppState) -> Settings {
    Settings {
        allow_registration: state.setting_bool("allow_registration", true).await,
        allow_anonymous_links: state.setting_bool("allow_anonymous_links", true).await,
        max_links_per_user: state.setting("max_links_per_user").await.and_then(|v| v.parse().ok()).unwrap_or(1000),
    }
}

pub async fn get_settings(State(state): State<AppState>, _a: AdminUser) -> Json<Settings> { Json(load_settings(&state).await) }

pub async fn put_settings(State(state): State<AppState>, AdminUser(a): AdminUser, ApiJson(s): ApiJson<Settings>) -> ApiResult<Json<Settings>> {
    if a.role != "super_admin" { return Err(ApiError::Forbidden); }
    if !(1..=1_000_000).contains(&s.max_links_per_user) { return Err(ApiError::bad("Max links per user must be between 1 and 1,000,000")); }
    for (k, v) in [("allow_registration", s.allow_registration.to_string()), ("allow_anonymous_links", s.allow_anonymous_links.to_string()), ("max_links_per_user", s.max_links_per_user.to_string())] {
        sqlx::query("insert into app_settings (key, value) values ($1,$2) on conflict (key) do update set value = excluded.value").bind(k).bind(v).execute(&state.db).await?;
    }
    state.audit(Some(a.id), "settings.update", "settings", "app", serde_json::to_value(&s).unwrap_or_default()).await;
    Ok(Json(load_settings(&state).await))
}

