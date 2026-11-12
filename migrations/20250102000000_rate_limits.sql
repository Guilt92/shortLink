-- Shared (cross-replica) fixed-window rate limiter state.
create table if not exists rate_limits (
    key          text primary key,
    window_start timestamptz not null default now(),
    hits         integer     not null default 0
);
create index if not exists rate_limits_window_idx on rate_limits (window_start);
