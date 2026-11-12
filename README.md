# ShortLink

A self-hosted URL shortener with accounts, link management, analytics, QR codes, custom domains and an admin console.

- **Backend:** Rust (axum, sqlx, PostgreSQL). Serves the API, redirects and the built frontend.
- **Frontend:** React + TypeScript + Tailwind, in `frontend/`, served at `/app`.

## Run with Docker

```bash
cp .env.example .env     # set POSTGRES_PASSWORD, and ADMIN_EMAIL / ADMIN_PASSWORD for the first admin
docker compose up --build
```

Open http://localhost:3000 (or `/app` for the dashboard). Migrations run on startup.

## Local development

```bash
export DATABASE_URL=postgres://user:pass@localhost:5432/shortlink
cargo run                                  # backend
cd frontend && npm ci && npm run dev       # frontend, http://localhost:5173/app/
```

Tests (need a Postgres server):

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/postgres cargo test
cd frontend && npm run lint && npm test
```

## Configuration

See `.env.example`. The ones that matter in production:

- `PUBLIC_BASE_URL`: public https URL, used for short links and reset links.
- `TRUST_PROXY=true`: only behind a reverse proxy that sets `X-Forwarded-For`.
- `VISITOR_SALT`: random secret, so unique-visitor counts survive restarts.

## Notes

- Password-reset emails are not sent yet. With `MAIL_MODE=log` the reset link is written to the server log (development only).
- The app serves plain HTTP; put a TLS-terminating proxy in front of it.
- Account-wide analytics read raw click rows and get slow at hundreds of thousands of clicks.
