-- SaaS schema. Idempotent against databases that already contain the legacy
-- `link` / `link_statistics` tables (the three earlier migrations are empty placeholders).

create table if not exists users (
    id            bigserial primary key,
    email         text not null,
    name          text not null,
    password_hash text not null,
    role          text not null default 'user' check (role in ('user','admin','super_admin')),
    status        text not null default 'active' check (status in ('active','suspended')),
    created_at    timestamptz not null default now(),
    last_login_at timestamptz
);
create unique index if not exists users_email_lower_idx on users (lower(email));

create table if not exists sessions (
    id         bigserial primary key,
    user_id    bigint not null references users(id) on delete cascade,
    token_hash text not null unique,
    user_agent text,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
);
create index if not exists sessions_user_idx on sessions (user_id);

create table if not exists password_resets (
    id         bigserial primary key,
    user_id    bigint not null references users(id) on delete cascade,
    token_hash text not null unique,
    expires_at timestamptz not null,
    used_at    timestamptz
);

create table if not exists domains (
    id           bigserial primary key,
    user_id      bigint not null references users(id) on delete cascade,
    hostname     text not null,
    verify_token text not null,
    verified_at  timestamptz,
    created_at   timestamptz not null default now()
);
create unique index if not exists domains_hostname_idx on domains (lower(hostname));

create table if not exists link (
    id         text primary key,
    target_url text not null
);
alter table link add column if not exists user_id    bigint references users(id) on delete cascade;
alter table link add column if not exists domain_id  bigint references domains(id) on delete set null;
alter table link add column if not exists is_active  boolean not null default true;
alter table link add column if not exists disabled_by_admin boolean not null default false;
alter table link add column if not exists expires_at timestamptz;
alter table link add column if not exists created_at timestamptz not null default now();
create index if not exists link_user_idx on link (user_id, created_at desc);

create table if not exists link_statistics (
    link_id    text not null,
    referer    text,
    user_agent text
);
alter table link_statistics add column if not exists id           bigserial;
alter table link_statistics add column if not exists created_at   timestamptz not null default now();
alter table link_statistics add column if not exists referer_host text;
alter table link_statistics add column if not exists device       text;
alter table link_statistics add column if not exists browser      text;
alter table link_statistics add column if not exists os           text;
alter table link_statistics add column if not exists visitor_hash text;
create index if not exists link_statistics_link_idx on link_statistics (link_id, created_at);
create index if not exists link_statistics_created_idx on link_statistics (created_at);

create table if not exists abuse_reports (
    id           bigserial primary key,
    link_id      text,
    reported_url text not null,
    reporter     text,
    reason       text not null,
    details      text,
    status       text not null default 'pending' check (status in ('pending','resolved','rejected')),
    assigned_to  bigint references users(id) on delete set null,
    created_at   timestamptz not null default now(),
    resolved_at  timestamptz
);
create index if not exists abuse_reports_status_idx on abuse_reports (status, created_at desc);

create table if not exists audit_logs (
    id          bigserial primary key,
    actor_id    bigint references users(id) on delete set null,
    action      text not null,
    target_type text,
    target_id   text,
    details     jsonb,
    created_at  timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on audit_logs (created_at desc);

create table if not exists app_settings (
    key   text primary key,
    value text not null
);
insert into app_settings (key, value) values
    ('allow_registration', 'true'),
    ('allow_anonymous_links', 'true'),
    ('max_links_per_user', '1000')
on conflict (key) do nothing;
