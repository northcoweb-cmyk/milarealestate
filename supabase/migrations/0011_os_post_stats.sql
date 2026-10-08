-- Mila OS: likes/views/comments/shares for each logged post (read from the public post page). Safe to run more than once.
alter table os_items add column if not exists views bigint;
alter table os_items add column if not exists likes bigint;
alter table os_items add column if not exists comments bigint;
alter table os_items add column if not exists shares bigint;
alter table os_items add column if not exists stats_at timestamptz;
