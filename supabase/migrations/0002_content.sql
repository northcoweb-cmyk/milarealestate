-- Content & marketing: richer social_posts. Safe to run more than once.
alter table social_posts add column if not exists category text;
alter table social_posts add column if not exists posted_at timestamptz;
alter table social_posts add column if not exists variant integer;
create index if not exists social_posts_user_status_idx on social_posts(user_id, status, scheduled_for);
