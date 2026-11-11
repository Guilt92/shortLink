use crate::error::ApiResult;
use serde::Serialize;
use sqlx::{FromRow, PgPool};

#[derive(Default, Clone)]
pub struct Scope {
    pub user_id: Option<i64>,
    pub code: Option<String>,
}

#[derive(Serialize, FromRow)]
pub struct Point {
    pub bucket: String,
    pub clicks: i64,
    pub visitors: i64,
}

#[derive(Serialize, FromRow)]
pub struct NameCount {
    pub name: String,
    pub count: i64,
}

pub fn clamp_days(d: Option<i64>) -> i64 {
    d.unwrap_or(30).clamp(1, 365)
}

pub fn gran(g: &Option<String>) -> &'static str {
    match g.as_deref() {
        Some("week") => "week",
        Some("month") => "month",
        _ => "day",
    }
}

pub async fn series(db: &PgPool, scope: &Scope, days: i64, g: &str) -> ApiResult<Vec<Point>> {
    Ok(sqlx::query_as::<_, Point>(
        r#"select to_char(b.bucket at time zone 'UTC', 'YYYY-MM-DD') as bucket,
                  coalesce(c.clicks, 0)::bigint as clicks, coalesce(c.visitors, 0)::bigint as visitors
           from generate_series(date_trunc($1, now() - make_interval(days => $2), 'UTC'),
                                date_trunc($1, now(), 'UTC'), ('1 ' || $1)::interval) as b(bucket)
           left join (
               select date_trunc($1, s.created_at, 'UTC') as bucket, count(*) as clicks, count(distinct s.visitor_hash) as visitors
               from link_statistics s join link l on l.id = s.link_id
               where s.created_at >= date_trunc($1, now() - make_interval(days => $2), 'UTC')
                 and ($3::bigint is null or l.user_id = $3) and ($4::text is null or l.id = $4)
               group by 1) c on c.bucket = b.bucket
           order by b.bucket"#,
    )
    .bind(g).bind(days as i32).bind(scope.user_id).bind(&scope.code)
    .fetch_all(db).await?)
}

/// (clicks, unique visitors) for a window `[now - from_days, now - to_days)`.
pub async fn window_totals(db: &PgPool, scope: &Scope, from_days: i32, to_days: i32) -> ApiResult<(i64, i64)> {
    Ok(sqlx::query_as::<_, (i64, i64)>(
        r#"select count(*)::bigint, count(distinct s.visitor_hash)::bigint
           from link_statistics s join link l on l.id = s.link_id
           where s.created_at >= now() - make_interval(days => $1) and s.created_at < now() - make_interval(days => $2)
             and ($3::bigint is null or l.user_id = $3) and ($4::text is null or l.id = $4)"#,
    )
    .bind(from_days).bind(to_days).bind(scope.user_id).bind(&scope.code)
    .fetch_one(db).await?)
}

/// `col` is chosen from a fixed whitelist, never from user input.
pub async fn breakdown(db: &PgPool, scope: &Scope, days: i64, col: &str) -> ApiResult<Vec<NameCount>> {
    let expr = match col {
        "referer" => "coalesce(s.referer_host, 'Direct')",
        "device" => "coalesce(s.device, 'Unknown')",
        "browser" => "coalesce(s.browser, 'Unknown')",
        "os" => "coalesce(s.os, 'Unknown')",
        _ => return Ok(vec![]),
    };
    let sql = format!(
        "select {expr} as name, count(*)::bigint as count from link_statistics s join link l on l.id = s.link_id
         where s.created_at >= now() - make_interval(days => $1)
           and ($2::bigint is null or l.user_id = $2) and ($3::text is null or l.id = $3)
         group by 1 order by 2 desc, 1 limit 8"
    );
    Ok(sqlx::query_as::<_, NameCount>(&sql).bind(days as i32).bind(scope.user_id).bind(&scope.code).fetch_all(db).await?)
}

/// Daily/weekly/monthly creation counts for `users` or `link`.
pub async fn created_series(db: &PgPool, table: &str, days: i64, g: &str) -> ApiResult<Vec<(String, i64)>> {
    let tbl = match table { "users" => "users", _ => "link" };
    let sql = format!(
        r#"select to_char(b.bucket at time zone 'UTC', 'YYYY-MM-DD'), coalesce(c.n, 0)::bigint
           from generate_series(date_trunc($1, now() - make_interval(days => $2), 'UTC'), date_trunc($1, now(), 'UTC'), ('1 ' || $1)::interval) as b(bucket)
           left join (select date_trunc($1, created_at, 'UTC') as bucket, count(*) as n from {tbl}
                      where created_at >= date_trunc($1, now() - make_interval(days => $2), 'UTC') group by 1) c on c.bucket = b.bucket
           order by b.bucket"#
    );
    Ok(sqlx::query_as::<_, (String, i64)>(&sql).bind(g).bind(days as i32).fetch_all(db).await?)
}
