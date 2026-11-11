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
- Rate limits are in-memory per process (login, register, reset, anonymous create, reports, redirects).

## Known limitations

- **No email transport.** Password reset tokens are created and stored hashed, but delivering the email needs an SMTP/provider
  integration. With `MAIL_MODE=log` the reset link is written to the server log (development only).
- No email verification, API keys, campaigns/groups, per-link passwords, UTM builder or localisation/RTL (the project was
  English-only).
- The Docker image build and the compose stack were written but not exercised in the environment where this was developed.
- Dev-only npm audit findings exist in the ESLint toolchain (`minimatch`); production dependencies report none.
