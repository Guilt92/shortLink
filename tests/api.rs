use axum::{
    body::{to_bytes, Body},
    http::{header, HeaderMap, Method, Request, StatusCode},
    Router,
};
use link_shortener::{auth::create_user, build_app, config::Config, state::AppState, util::sha256_hex};
use serde_json::{json, Value};
use sqlx::PgPool;
use tower::ServiceExt;

struct T {
    app: Router,
    state: AppState,
}

fn setup(pool: PgPool) -> T {
    let state = AppState::new(pool, Config::for_tests());
    T { app: build_app(state.clone()), state }
}

impl T {
    async fn call(&self, method: Method, uri: &str, cookie: Option<&str>, body: Option<Value>, csrf: bool) -> (StatusCode, HeaderMap, Value) {
        let mut b = Request::builder().method(method).uri(uri).header("x-forwarded-for", "10.0.0.1");
        if csrf { b = b.header("x-sl-csrf", "1"); }
        if let Some(c) = cookie { b = b.header(header::COOKIE, c); }
        let req = if let Some(j) = body {
            b.header(header::CONTENT_TYPE, "application/json").body(Body::from(j.to_string())).unwrap()
        } else { b.body(Body::empty()).unwrap() };
        let res = self.app.clone().oneshot(req).await.unwrap();
        let (parts, body) = res.into_parts();
        let bytes = to_bytes(body, 1 << 20).await.unwrap();
        let v = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        (parts.status, parts.headers, v)
    }
    async fn get(&self, uri: &str, cookie: Option<&str>) -> (StatusCode, Value) {
        let (s, _, v) = self.call(Method::GET, uri, cookie, None, true).await; (s, v)
    }
    async fn post(&self, uri: &str, cookie: Option<&str>, body: Value) -> (StatusCode, Value) {
        let (s, _, v) = self.call(Method::POST, uri, cookie, Some(body), true).await; (s, v)
    }
    async fn patch(&self, uri: &str, cookie: Option<&str>, body: Value) -> (StatusCode, Value) {
        let (s, _, v) = self.call(Method::PATCH, uri, cookie, Some(body), true).await; (s, v)
    }
    async fn del(&self, uri: &str, cookie: Option<&str>) -> StatusCode {
        self.call(Method::DELETE, uri, cookie, None, true).await.0
    }
    async fn register(&self, email: &str) -> String {
        let (s, h, _) = self.call(Method::POST, "/api/auth/register", None, Some(json!({"name":"Test","email":email,"password":"password123"})), true).await;
        assert_eq!(s, StatusCode::CREATED);
        cookie_of(&h)
    }
    async fn login(&self, email: &str, pw: &str) -> (StatusCode, Option<String>) {
        let (s, h, _) = self.call(Method::POST, "/api/auth/login", None, Some(json!({"email":email,"password":pw})), true).await;
        (s, h.get(header::SET_COOKIE).map(|_| cookie_of(&h)))
    }
    async fn admin(&self, email: &str, role: &str) -> String {
        create_user(&self.state, "Admin", email, "password123", role).await.unwrap();
        self.login(email, "password123").await.1.unwrap()
    }
}

fn cookie_of(h: &HeaderMap) -> String {
    h.get(header::SET_COOKIE).unwrap().to_str().unwrap().split(';').next().unwrap().to_string()
}

#[sqlx::test(migrations = "./migrations")]
async fn auth_lifecycle(pool: PgPool) {
    let t = setup(pool);
    let c = t.register("A@Example.com").await;
    let (s, me) = t.get("/api/me", Some(&c)).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(me["email"], "a@example.com");
    assert_eq!(me["role"], "user");
    assert!(me.get("passwordHash").is_none());
    // duplicate email (case-insensitive)
    let (s, _, _) = t.call(Method::POST, "/api/auth/register", None, Some(json!({"name":"x","email":"a@example.com","password":"password123"})), true).await;
    assert_eq!(s, StatusCode::CONFLICT);
    // weak password
    let (s, _, _) = t.call(Method::POST, "/api/auth/register", None, Some(json!({"name":"x","email":"b@example.com","password":"short"})), true).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    // wrong password / unknown user produce the same response
    let (s1, _) = t.login("a@example.com", "wrongpass1").await;
    let (s2, _) = t.login("nobody@example.com", "wrongpass1").await;
    assert_eq!((s1, s2), (StatusCode::UNAUTHORIZED, StatusCode::UNAUTHORIZED));
    let (s, c2) = t.login("a@example.com", "password123").await;
    assert_eq!(s, StatusCode::OK);
    // logout revokes the session server-side
    let (s, _, _) = t.call(Method::POST, "/api/auth/logout", c2.as_deref(), None, true).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    assert_eq!(t.get("/api/me", c2.as_deref()).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(t.get("/api/me", None).await.0, StatusCode::UNAUTHORIZED);
    // session cookie flags
    let (_, h, _) = t.call(Method::POST, "/api/auth/login", None, Some(json!({"email":"a@example.com","password":"password123","remember":true})), true).await;
    let sc = h.get(header::SET_COOKIE).unwrap().to_str().unwrap();
    assert!(sc.contains("HttpOnly") && sc.contains("SameSite=Lax") && sc.contains("Max-Age="));
}

#[sqlx::test(migrations = "./migrations")]
async fn csrf_and_headers(pool: PgPool) {
    let t = setup(pool);
    let (s, _, _) = t.call(Method::POST, "/api/auth/login", None, Some(json!({"email":"a@b.co","password":"x"})), false).await;
    assert_eq!(s, StatusCode::FORBIDDEN);
    let (_, h, _) = t.call(Method::GET, "/", None, None, true).await;
    assert_eq!(h.get("x-content-type-options").unwrap(), "nosniff");
    assert_eq!(h.get("x-frame-options").unwrap(), "DENY");
    assert!(h.get("content-security-policy").is_some());
    let (s, _, _) = t.call(Method::GET, "/api/nope", None, None, true).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrations = "./migrations")]
async fn login_brute_force_is_throttled(pool: PgPool) {
    let t = setup(pool);
    t.register("a@example.com").await;
    let mut last = StatusCode::OK;
    for _ in 0..12 { last = t.login("a@example.com", "badpassword1").await.0; }
    assert_eq!(last, StatusCode::TOO_MANY_REQUESTS);
    // even the right password is now refused for the window
    assert_eq!(t.login("a@example.com", "password123").await.0, StatusCode::TOO_MANY_REQUESTS);
}

#[sqlx::test(migrations = "./migrations")]
async fn password_reset_flow(pool: PgPool) {
    let t = setup(pool.clone());
    t.register("a@example.com").await;
    let (s, v) = t.post("/api/auth/forgot-password", None, json!({"email":"a@example.com"})).await;
    assert_eq!(s, StatusCode::OK);
    let (s2, v2) = t.post("/api/auth/forgot-password", None, json!({"email":"ghost@example.com"})).await;
    assert_eq!((s2, &v2), (StatusCode::OK, &v)); // no enumeration
    let n: i64 = sqlx::query_scalar("select count(*) from password_resets").fetch_one(&pool).await.unwrap();
    assert_eq!(n, 1);
    // the plaintext token is never stored; plant a known one for the test
    sqlx::query("update password_resets set token_hash = $1").bind(sha256_hex("known-token")).execute(&pool).await.unwrap();
    let (s, _) = t.post("/api/auth/reset-password", None, json!({"token":"wrong","password":"newpassword9"})).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (s, _) = t.post("/api/auth/reset-password", None, json!({"token":"known-token","password":"newpassword9"})).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    let (s, _) = t.post("/api/auth/reset-password", None, json!({"token":"known-token","password":"another1234"})).await;
    assert_eq!(s, StatusCode::BAD_REQUEST); // single use
    assert_eq!(t.login("a@example.com", "password123").await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(t.login("a@example.com", "newpassword9").await.0, StatusCode::OK);
}

#[sqlx::test(migrations = "./migrations")]
async fn link_crud_redirect_and_validation(pool: PgPool) {
    let t = setup(pool);
    let c = t.register("a@example.com").await;
    for bad in ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "ftp://x.com", "nonsense", "http://short.test/x"] {
        let (s, _) = t.post("/api/links", Some(&c), json!({"targetUrl": bad})).await;
        assert_eq!(s, StatusCode::BAD_REQUEST, "{bad}");
    }
    let (s, link) = t.post("/api/links", Some(&c), json!({"targetUrl":"https://example.com/page","alias":"my-link"})).await;
    assert_eq!(s, StatusCode::CREATED);
    assert_eq!(link["shortUrl"], "http://short.test/my-link");
    assert_eq!(link["status"], "active");
    assert_eq!(t.post("/api/links", Some(&c), json!({"targetUrl":"https://example.com","alias":"my-link"})).await.0, StatusCode::CONFLICT);
    assert_eq!(t.post("/api/links", Some(&c), json!({"targetUrl":"https://example.com","alias":"api"})).await.0, StatusCode::BAD_REQUEST);
    assert_eq!(t.post("/api/links", Some(&c), json!({"targetUrl":"https://example.com","expiresAt":"2000-01-01T00:00:00Z"})).await.0, StatusCode::BAD_REQUEST);
    let (_, auto) = t.post("/api/links", Some(&c), json!({"targetUrl":"https://example.org"})).await;
    assert_eq!(auto["code"].as_str().unwrap().len(), 7);

    // redirect: not cacheable, click recorded
    let (s, h, _) = t.call(Method::GET, "/my-link", None, None, false).await;
    assert_eq!(s, StatusCode::TEMPORARY_REDIRECT);
    assert_eq!(h.get("location").unwrap(), "https://example.com/page");
    assert_eq!(h.get("cache-control").unwrap(), "private, no-store");
    let mut clicks = 0;
    for _ in 0..40 {
        clicks = t.get("/api/links/my-link", Some(&c)).await.1["clicks"].as_i64().unwrap();
        if clicks > 0 { break; }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert_eq!(clicks, 1);
    let (_, st) = t.get("/api/links/my-link/stats?days=7", Some(&c)).await;
    assert_eq!(st["clicks"], 1);
    assert_eq!(st["uniqueVisitors"], 1);
    assert_eq!(st["series"].as_array().unwrap().len(), 8);

    assert_eq!(t.call(Method::GET, "/missing1", None, None, false).await.0, StatusCode::NOT_FOUND);

    // edit, disable, expire
    let (s, u) = t.patch("/api/links/my-link", Some(&c), json!({"targetUrl":"https://example.net"})).await;
    assert_eq!((s, u["targetUrl"].as_str().unwrap()), (StatusCode::OK, "https://example.net/"));
    assert_eq!(t.patch("/api/links/my-link", Some(&c), json!({"targetUrl":"javascript:1"})).await.0, StatusCode::BAD_REQUEST);
    t.patch("/api/links/my-link", Some(&c), json!({"isActive": false})).await;
    assert_eq!(t.call(Method::GET, "/my-link", None, None, false).await.0, StatusCode::GONE);
    t.patch("/api/links/my-link", Some(&c), json!({"isActive": true, "expiresAt": "2099-01-01T00:00:00Z"})).await;
    assert_eq!(t.call(Method::GET, "/my-link", None, None, false).await.0, StatusCode::TEMPORARY_REDIRECT);
    sqlx::query("update link set expires_at = now() - interval '1 minute' where id = 'my-link'").execute(&t.state.db).await.unwrap();
    assert_eq!(t.call(Method::GET, "/my-link", None, None, false).await.0, StatusCode::GONE);
    let (_, l) = t.get("/api/links?status=expired", Some(&c)).await;
    assert_eq!(l["total"], 1);
    // clear expiry with explicit null
    let (_, u) = t.patch("/api/links/my-link", Some(&c), json!({"expiresAt": null})).await;
    assert!(u["expiresAt"].is_null());

    // list: search/sort/pagination, wildcard characters are literal
    let (_, l) = t.get("/api/links?q=%25&perPage=1", Some(&c)).await;
    assert_eq!(l["total"], 0);
    let (_, l) = t.get("/api/links?perPage=1&page=2&sort=code&order=asc", Some(&c)).await;
    assert_eq!((l["total"].as_i64().unwrap(), l["items"].as_array().unwrap().len()), (2, 1));

    // bulk + qr + delete
    let (_, b) = t.post("/api/links/bulk", Some(&c), json!({"codes":["my-link"],"action":"disable"})).await;
    assert_eq!(b["affected"], 1);
    let (s, _, _) = t.call(Method::GET, "/api/links/my-link/qr.svg", Some(&c), None, true).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(t.del("/api/links/my-link", Some(&c)).await, StatusCode::NO_CONTENT);
    assert_eq!(t.del("/api/links/my-link", Some(&c)).await, StatusCode::NOT_FOUND);
    let n: i64 = sqlx::query_scalar("select count(*) from link_statistics where link_id = 'my-link'").fetch_one(&t.state.db).await.unwrap();
    assert_eq!(n, 0);
}

#[sqlx::test(migrations = "./migrations")]
async fn users_cannot_touch_each_others_links(pool: PgPool) {
    let t = setup(pool);
    let a = t.register("a@example.com").await;
    let b = t.register("b@example.com").await;
    t.post("/api/links", Some(&a), json!({"targetUrl":"https://example.com","alias":"owned-by-a"})).await;
    assert_eq!(t.get("/api/links/owned-by-a", Some(&b)).await.0, StatusCode::NOT_FOUND);
    assert_eq!(t.get("/api/links/owned-by-a/stats", Some(&b)).await.0, StatusCode::NOT_FOUND);
    assert_eq!(t.patch("/api/links/owned-by-a", Some(&b), json!({"isActive":false})).await.0, StatusCode::NOT_FOUND);
    assert_eq!(t.del("/api/links/owned-by-a", Some(&b)).await, StatusCode::NOT_FOUND);
    let (_, bulk) = t.post("/api/links/bulk", Some(&b), json!({"codes":["owned-by-a"],"action":"delete"})).await;
    assert_eq!(bulk["affected"], 0);
    let (_, l) = t.get("/api/links", Some(&b)).await;
    assert_eq!(l["total"], 0);
    assert_eq!(t.call(Method::GET, "/api/links/owned-by-a/qr.svg", Some(&b), None, true).await.0, StatusCode::NOT_FOUND);
    // another user's domain cannot be used
    let (_, d) = t.post("/api/domains", Some(&a), json!({"hostname":"links.example.com"})).await;
    let did = d["id"].as_i64().unwrap();
    assert_eq!(t.del(&format!("/api/domains/{did}"), Some(&b)).await, StatusCode::NOT_FOUND);
    assert_eq!(t.post(&format!("/api/domains/{did}/verify"), Some(&b), json!({})).await.0, StatusCode::NOT_FOUND);
    assert_eq!(t.post("/api/links", Some(&b), json!({"targetUrl":"https://example.com","domainId":did})).await.0, StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_endpoints_require_admin_role(pool: PgPool) {
    let t = setup(pool);
    let user = t.register("u@example.com").await;
    for path in ["/api/admin/overview", "/api/admin/users", "/api/admin/links", "/api/admin/domains", "/api/admin/reports", "/api/admin/audit", "/api/admin/settings", "/api/admin/analytics", "/api/admin/users/1"] {
        assert_eq!(t.get(path, Some(&user)).await.0, StatusCode::FORBIDDEN, "{path}");
        assert_eq!(t.get(path, None).await.0, StatusCode::UNAUTHORIZED, "{path}");
    }
    assert_eq!(t.patch("/api/admin/users/1", Some(&user), json!({"role":"super_admin"})).await.0, StatusCode::FORBIDDEN);
    assert_eq!(t.del("/api/admin/users/1", Some(&user)).await, StatusCode::FORBIDDEN);
    assert_eq!(t.call(Method::PUT, "/api/admin/settings", Some(&user), Some(json!({"allowRegistration":false,"allowAnonymousLinks":false,"maxLinksPerUser":5})), true).await.0, StatusCode::FORBIDDEN);
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_user_management_rules(pool: PgPool) {
    let t = setup(pool);
    let sup = t.admin("root@example.com", "super_admin").await;
    let adm = t.admin("admin@example.com", "admin").await;
    let user = t.register("u@example.com").await;
    let (_, me) = t.get("/api/me", Some(&user)).await;
    let uid = me["id"].as_i64().unwrap();
    let (_, sme) = t.get("/api/me", Some(&sup)).await;
    let sid = sme["id"].as_i64().unwrap();

    let (s, list) = t.get("/api/admin/users?q=u%40example&role=user", Some(&adm)).await;
    assert_eq!((s, list["total"].as_i64().unwrap()), (StatusCode::OK, 1));
    assert!(list["items"][0].get("passwordHash").is_none());

    // plain admin: can suspend a user, cannot change roles, cannot touch super admins, cannot delete
    assert_eq!(t.patch(&format!("/api/admin/users/{uid}"), Some(&adm), json!({"role":"admin"})).await.0, StatusCode::FORBIDDEN);
    assert_eq!(t.patch(&format!("/api/admin/users/{sid}"), Some(&adm), json!({"status":"suspended"})).await.0, StatusCode::FORBIDDEN);
    assert_eq!(t.del(&format!("/api/admin/users/{uid}"), Some(&adm)).await, StatusCode::FORBIDDEN);
    let (s, _) = t.patch(&format!("/api/admin/users/{uid}"), Some(&adm), json!({"status":"suspended"})).await;
    assert_eq!(s, StatusCode::OK);
    // suspension kills the live session and blocks login
    assert_eq!(t.get("/api/me", Some(&user)).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(t.login("u@example.com", "password123").await.0, StatusCode::FORBIDDEN);
    t.patch(&format!("/api/admin/users/{uid}"), Some(&adm), json!({"status":"active"})).await;
    assert_eq!(t.login("u@example.com", "password123").await.0, StatusCode::OK);

    // super admin: promote, but never self-demote / self-delete
    let (s, u) = t.patch(&format!("/api/admin/users/{uid}"), Some(&sup), json!({"role":"admin"})).await;
    assert_eq!((s, u["role"].as_str().unwrap()), (StatusCode::OK, "admin"));
    assert_eq!(t.patch(&format!("/api/admin/users/{sid}"), Some(&sup), json!({"role":"user"})).await.0, StatusCode::BAD_REQUEST);
    assert_eq!(t.del(&format!("/api/admin/users/{sid}"), Some(&sup)).await, StatusCode::BAD_REQUEST);
    assert_eq!(t.patch(&format!("/api/admin/users/{uid}"), Some(&sup), json!({"role":"god"})).await.0, StatusCode::BAD_REQUEST);

    let (s, d) = t.get(&format!("/api/admin/users/{uid}"), Some(&adm)).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(d["usage"]["links"], 0);
    assert_eq!(t.del(&format!("/api/admin/users/{uid}"), Some(&sup)).await, StatusCode::NO_CONTENT);
    assert_eq!(t.get(&format!("/api/admin/users/{uid}"), Some(&sup)).await.0, StatusCode::NOT_FOUND);

    let (_, audit) = t.get("/api/admin/audit?q=user.update", Some(&adm)).await;
    assert!(audit["total"].as_i64().unwrap() >= 3);
    let (s, o) = t.get("/api/admin/overview?days=7", Some(&adm)).await;
    assert_eq!(s, StatusCode::OK);
    assert!(o["totals"]["users"].as_i64().unwrap() >= 2);
    assert_eq!(o["registrations"].as_array().unwrap().len(), 8);
}

#[sqlx::test(migrations = "./migrations")]
async fn abuse_report_moderation(pool: PgPool) {
    let t = setup(pool);
    let sup = t.admin("root@example.com", "super_admin").await;
    let user = t.register("u@example.com").await;
    t.post("/api/links", Some(&user), json!({"targetUrl":"https://evil.example","alias":"bad-link"})).await;
    let (s, _) = t.post("/api/reports", None, json!({"url":"http://short.test/bad-link","reason":"phishing"})).await;
    assert_eq!(s, StatusCode::CREATED);
    assert_eq!(t.post("/api/reports", None, json!({"url":"http://short.test/x","reason":"nonsense"})).await.0, StatusCode::BAD_REQUEST);
    let (_, r) = t.get("/api/admin/reports?status=pending", Some(&sup)).await;
    assert_eq!(r["total"], 1);
    assert_eq!(r["items"][0]["linkId"], "bad-link");
    let rid = r["items"][0]["id"].as_i64().unwrap();
    assert_eq!(t.patch(&format!("/api/admin/reports/{rid}"), Some(&sup), json!({"status":"resolved","disableLink":true})).await.0, StatusCode::NO_CONTENT);
    assert_eq!(t.patch(&format!("/api/admin/reports/{rid}"), Some(&sup), json!({"status":"rejected"})).await.0, StatusCode::CONFLICT);
    assert_eq!(t.call(Method::GET, "/bad-link", None, None, false).await.0, StatusCode::GONE);
    // owner cannot re-enable an admin-disabled link
    t.patch("/api/links/bad-link", Some(&user), json!({"isActive": true})).await;
    assert_eq!(t.call(Method::GET, "/bad-link", None, None, false).await.0, StatusCode::GONE);
    let (_, l) = t.get("/api/admin/links?status=disabled&q=bad", Some(&sup)).await;
    assert_eq!(l["total"], 1);
    let (_, l) = t.patch("/api/admin/links/bad-link", Some(&sup), json!({"disabled": false})).await;
    assert_eq!(l["status"], "active");
    assert_eq!(t.call(Method::GET, "/bad-link", None, None, false).await.0, StatusCode::TEMPORARY_REDIRECT);
}

#[sqlx::test(migrations = "./migrations")]
async fn settings_are_enforced(pool: PgPool) {
    let t = setup(pool);
    let sup = t.admin("root@example.com", "super_admin").await;
    // legacy anonymous endpoint
    let (s, v) = t.post("/create", None, json!({"targetUrl":"https://example.com"})).await;
    assert_eq!(s, StatusCode::OK);
    assert!(v["id"].as_str().is_some() && v["targetUrl"].as_str().is_some());
    assert_eq!(t.post("/create", None, json!({"targetUrl":"javascript:alert(1)"})).await.0, StatusCode::BAD_REQUEST);
    let (s, _, _) = t.call(Method::PUT, "/api/admin/settings", Some(&sup), Some(json!({"allowRegistration":false,"allowAnonymousLinks":false,"maxLinksPerUser":1})), true).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(t.post("/create", None, json!({"targetUrl":"https://example.com"})).await.0, StatusCode::FORBIDDEN);
    let (s, _, _) = t.call(Method::POST, "/api/auth/register", None, Some(json!({"name":"x","email":"n@example.com","password":"password123"})), true).await;
    assert_eq!(s, StatusCode::FORBIDDEN);
    // per-user link limit
    assert_eq!(t.post("/api/links", Some(&sup), json!({"targetUrl":"https://a.example"})).await.0, StatusCode::CREATED);
    assert_eq!(t.post("/api/links", Some(&sup), json!({"targetUrl":"https://b.example"})).await.0, StatusCode::CONFLICT);
}

#[sqlx::test(migrations = "./migrations")]
async fn domains_and_overview(pool: PgPool) {
    let t = setup(pool);
    let c = t.register("a@example.com").await;
    assert_eq!(t.post("/api/domains", Some(&c), json!({"hostname":"http://bad"})).await.0, StatusCode::BAD_REQUEST);
    let (s, d) = t.post("/api/domains", Some(&c), json!({"hostname":"Links.Example.com"})).await;
    assert_eq!(s, StatusCode::CREATED);
    assert_eq!(d["hostname"], "links.example.com");
    assert_eq!(d["verified"], false);
    assert_eq!(d["dns"]["txt"]["name"], "_shortlink-verify.links.example.com");
    assert_eq!(t.post("/api/domains", Some(&c), json!({"hostname":"links.example.com"})).await.0, StatusCode::CONFLICT);
    // an unverified domain cannot be used for links, and verification must not be faked
    let did = d["id"].as_i64().unwrap();
    assert_eq!(t.post("/api/links", Some(&c), json!({"targetUrl":"https://x.example","domainId":did})).await.0, StatusCode::BAD_REQUEST);
    assert_eq!(t.post(&format!("/api/domains/{did}/verify"), Some(&c), json!({})).await.0, StatusCode::BAD_REQUEST);
    sqlx::query("update domains set verified_at = now()").execute(&t.state.db).await.unwrap();
    let (s, l) = t.post("/api/links", Some(&c), json!({"targetUrl":"https://x.example","alias":"on-domain","domainId":did})).await;
    assert_eq!((s, l["shortUrl"].as_str().unwrap()), (StatusCode::CREATED, "http://links.example.com/on-domain"));

    let (s, o) = t.get("/api/stats/overview?days=30&granularity=week", Some(&c)).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!((o["totalLinks"].as_i64().unwrap(), o["activeLinks"].as_i64().unwrap()), (1, 1));
    assert_eq!(o["recentLinks"].as_array().unwrap().len(), 1);
    let (s, a) = t.get("/api/stats/analytics?days=7", Some(&c)).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(a["clicks"], 0);
    assert_eq!(a["series"].as_array().unwrap().len(), 8);
    assert_eq!(t.get("/api/stats/analytics", None).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(t.del(&format!("/api/domains/{did}"), Some(&c)).await, StatusCode::NO_CONTENT);
    let (_, l) = t.get("/api/links/on-domain", Some(&c)).await;
    assert!(l["domain"].is_null());
}

#[sqlx::test(migrations = "./migrations")]
async fn change_password_revokes_other_sessions(pool: PgPool) {
    let t = setup(pool);
    let c1 = t.register("a@example.com").await;
    let c2 = t.login("a@example.com", "password123").await.1.unwrap();
    assert_eq!(t.post("/api/me/password", Some(&c1), json!({"currentPassword":"nope","newPassword":"newpassword9"})).await.0, StatusCode::BAD_REQUEST);
    assert_eq!(t.post("/api/me/password", Some(&c1), json!({"currentPassword":"password123","newPassword":"newpassword9"})).await.0, StatusCode::NO_CONTENT);
    assert_eq!(t.get("/api/me", Some(&c1)).await.0, StatusCode::OK);
    assert_eq!(t.get("/api/me", Some(&c2)).await.0, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn rate_limit_is_shared_between_replicas(pool: PgPool) {
    // Two independent AppState instances (separate in-memory state) on the same database.
    let a = AppState::new(pool.clone(), Config::for_tests());
    let b = AppState::new(pool, Config::for_tests());
    for _ in 0..3 { a.rate_limit("k", 5, 60).await.unwrap(); }
    for _ in 0..2 { b.rate_limit("k", 5, 60).await.unwrap(); }
    assert!(a.rate_limit("k", 5, 60).await.is_err(), "6th hit across replicas must be rejected");
    assert!(b.rate_limit("k", 5, 60).await.is_err());
    b.rate_limit("other", 5, 60).await.unwrap();
}

#[sqlx::test(migrations = "./migrations")]
async fn rate_limit_is_atomic_under_concurrency(pool: PgPool) {
    let s = AppState::new(pool, Config::for_tests());
    let mut hs = vec![];
    for _ in 0..40 { let s = s.clone(); hs.push(tokio::spawn(async move { s.rate_limit("burst", 10, 60).await.is_ok() })); }
    let mut ok = 0;
    for h in hs { if h.await.unwrap() { ok += 1; } }
    assert_eq!(ok, 10);
}
