# ShortLink

A self-hosted URL shortener with accounts, link management, analytics, QR codes, custom domains and an admin console.

- **Backend:** Rust (axum, sqlx, PostgreSQL). Serves the API, redirects and the built frontend.
- **Frontend:** React + TypeScript + Tailwind (shadcn/ui-style components, Radix primitives, Recharts) in `frontend/`, served at `/app`.
- **Landing page:** `/` (server-rendered with maud, no external scripts). Anonymous shortening via `POST /create`.

## Quick start (Docker)

```bash
cp .env.example .env        # set POSTGRES_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up --build
```

Open http://localhost:3000 (landing) or http://localhost:3000/app (dashboard). With `ADMIN_EMAIL`/`ADMIN_PASSWORD` set, a
`super_admin` account is created on first start. Migrations run automatically at startup.

## Local development

```bash
# database
export DATABASE_URL=postgres://user:pass@localhost:5432/shortlink
# backend (applies migrations, serves ./frontend/dist at /app)
cargo run
# frontend with hot reload (proxies /api to :3000)
cd frontend && npm ci && npm run dev      # http://localhost:5173/app/
```

Tests (need a Postgres server; `sqlx::test` creates one throw-away database per test):

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/postgres cargo test
cd frontend && npm run lint && npm test && npm run build
```

## Configuration

See `.env.example`. Notable settings: `PUBLIC_BASE_URL` (short URLs, reset links), `TRUST_PROXY` (set only behind a proxy that
appends `X-Forwarded-For`; used for rate limiting), `COOKIE_SECURE`, `VISITOR_SALT`, `DB_MAX_CONNECTIONS`, `MAIL_MODE=log`.

## Features and API

All JSON endpoints live under `/api` and use an HttpOnly session cookie. State-changing requests must send the header
`X-SL-CSRF: 1` (the SPA does this).

| Area | Endpoints |
| --- | --- |
| Auth | `POST /api/auth/{register,login,logout,forgot-password,reset-password}`, `GET/PATCH /api/me`, `POST /api/me/password` |
| Links | `GET/POST /api/links`, `GET/PATCH/DELETE /api/links/:code`, `POST /api/links/bulk`, `GET /api/links/:code/stats`, `GET /api/links/:code/qr.svg` |
| Stats | `GET /api/stats/overview`, `GET /api/stats/analytics` |
| Domains | `GET/POST /api/domains`, `POST /api/domains/:id/verify`, `DELETE /api/domains/:id` |
| Abuse | `POST /api/reports` (public, rate limited) |
| Admin (admin / super_admin) | `/api/admin/{overview,analytics,users,users/:id,links,links/:code,domains,reports,reports/:id,audit,settings}` |
| Public | `GET /:code` (redirect), `POST /create` (anonymous, legacy contract + `shortUrl`), `GET /health`, `GET /ready` |

Roles: `user` manages own links/domains. `admin` can moderate users (suspend/reactivate), links, domains and reports and read
audit logs/settings. `super_admin` additionally changes roles, deletes users and edits settings. Every check is enforced on
the server.

### Behaviour worth knowing

- Redirects return `307` with `Cache-Control: private, no-store` so each click is counted. Disabled / expired links return `410`.
- Only `http`/`https` targets are accepted (no credentials, no links back to this service).
- Unique visitors are an estimate: a salted hash of IP + user agent. Raw IPs are not stored. Country data is **not** collected.
- Custom domains are verified with a DNS TXT record (`_shortlink-verify.<host>`). The app does not issue TLS certificates;
  terminate HTTPS for those hostnames in your reverse proxy/CDN. Aliases are unique across all domains.
- Rate limits for login, register, password reset, anonymous create, reports, link/domain creation are stored in Postgres
  (`rate_limits` table, one atomic upsert per check), so they hold across replicas and restarts. Redirect throttling
  (600/min/IP) is process-local on purpose: a DB write per redirect would cost more than it protects.
  The per-email login limit (8 per 15 min, successful logins included) means someone who knows an address can temporarily
  block logins for it (account-lockout trade-off); the per-IP limit is separate.

## Production deployment checklist

Verified in the audit (see the final report): the Docker image builds, `docker compose up` starts healthy, migrations apply
to an empty database and to a database holding legacy data, SIGTERM exits cleanly (exit 0, <1 s), and the app recovers on its
own after the database restarts. What a production deployment still has to provide:

1. **TLS and a reverse proxy.** Serve over HTTPS (set `PUBLIC_BASE_URL=https://...` so cookies get `Secure`). Set
   `TRUST_PROXY=true` only if the proxy *appends* the client address to `X-Forwarded-For` (the rightmost entry is used).
   With `false` behind a proxy, all clients share one rate-limit bucket.
2. **Secrets.** Strong `POSTGRES_PASSWORD`, `VISITOR_SALT` (otherwise unique-visitor hashes change at every restart and differ
   between replicas) and a one-time `ADMIN_PASSWORD`. Remove `ADMIN_*` from the environment after the first start.
   If an earlier revision's tracked `.env` held real credentials, rotate them: it remains in git history.
3. **Never run with `MAIL_MODE=log`** in production: it writes live reset links to the logs.
4. **Email delivery** (below). Until then, password recovery is not usable by end users.
5. **Database.** Backups, and capacity for `replicas x DB_MAX_CONNECTIONS` (default 20) below Postgres `max_connections`
   (use PgBouncer or lower `DB_MAX_CONNECTIONS` when scaling out). Every query is bounded by a 30 s `statement_timeout`.
6. **Memory.** Argon2 uses ~19 MiB per hash; hashing runs on 4 dedicated threads (max 8 requests in flight, the rest wait up to
   10 s then get `503`). The image sets `MALLOC_MMAP_THRESHOLD_` so glibc returns those buffers to the OS.
7. **Custom domains** need DNS pointing at the service and TLS termination for each hostname at the proxy/CDN.

### Email / password recovery: what is required

Today `POST /api/auth/forgot-password` stores a hashed, single-use, 1-hour token and *logs* the link (only with
`MAIL_MODE=log`). To make recovery work for users you need:

- A sending service: SMTP relay (Postmark, SES, Mailgun, your own) or its HTTP API, plus credentials.
- A verified sending domain with **SPF, DKIM and DMARC** records, and a `From` address.
- A `mail` module (for SMTP e.g. the `lettre` crate with rustls) configured through new env vars (host, port, TLS mode,
  user, password, from address), with a plain-text + HTML template that links to `{PUBLIC_BASE_URL}/app/reset-password?token=...`.
- Delivery stays **off the request path** (already the case for token creation: the endpoint answers in the same time for known
  and unknown addresses; a synchronous SMTP call would reintroduce an account-enumeration timing signal). A durable outbox
  table with retry is recommended so a provider outage does not silently drop reset emails.
- Test against a local SMTP sink (Mailpit) in CI, then one real send per environment.
- Also recommended: a "your password was changed" notification and bounce/complaint handling.

## Performance notes (measured, 4 shared vCPUs, app + Postgres + load generator on one host)

- Redirect + asynchronous click write: roughly 1.7-2.0k req/s at 16-256 connections, p99 21-193 ms, no errors; every completed
  request had its click recorded.
- Per-link analytics: 0.07 s (3k clicks) to 0.3 s (65k clicks). **Account-wide and platform-wide analytics scan every click in
  the window**: with 565k clicks in 30 days they take about 2-9 s. Concurrent heavy analytics requests are capped at 4 so they
  cannot starve redirects, but a rollup (daily aggregate) table is the next step if accounts reach that volume.
- Link creation about 700 req/s; login about 30-55 req/s (Argon2-bound, by design).

## Known limitations

- **No email transport.** Password reset tokens are created and stored hashed, but delivering the email needs an SMTP/provider
  integration. With `MAIL_MODE=log` the reset link is written to the server log (development only).
- No email verification, API keys, campaigns/groups, per-link passwords, UTM builder or localisation/RTL (the project was
  English-only).
- Dev-only npm audit findings exist in the ESLint toolchain (`minimatch`); production dependencies report none.
  `cargo audit` lists two advisories (`rsa`, `libsqlite3-sys`) that exist only in `Cargo.lock` through sqlx's unused MySQL/SQLite
  drivers; neither is part of the build graph.
- Registering an already-used email returns 409 (needed for a usable sign-up form), so addresses can be probed at the register rate
  limit (10 per hour per IP) until email verification exists.
- A hostname verified by one account stays theirs until they remove it; a new owner must ask an admin to delete the stale claim.
