-- Add up migration script here
create table if not exists link
(
    id  text not null primary key,
    target_url text not null
)