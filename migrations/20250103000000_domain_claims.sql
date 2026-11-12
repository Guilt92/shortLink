-- A hostname may be *claimed* by several users, but only one can hold it verified.
-- Previously the unique index covered unverified claims too, so anyone could squat a
-- hostname and lock out its real owner.
drop index if exists domains_hostname_idx;
create unique index if not exists domains_verified_hostname_idx on domains (lower(hostname)) where verified_at is not null;
create unique index if not exists domains_user_hostname_idx on domains (user_id, lower(hostname));
