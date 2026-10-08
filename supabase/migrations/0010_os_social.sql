-- Mila OS team workspace: Sarah's daily social posts, her outreach to other realtors, and shared notes. Safe to run more than once.
create table if not exists os_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('post','outreach','note')),
  day date not null default (now() at time zone 'America/New_York')::date,
  platform text,   -- tiktok | x | instagram (posts and outreach)
  link text,       -- the post link
  handle text,     -- outreach: who she talked to
  note text,
  by text not null default 'sarah' check (by in ('ryan','sarah'))
);
create index if not exists os_items_day_idx on os_items (day desc, created_at desc);
alter table os_items enable row level security; -- no policies: only the server key (Mila OS) can read or write
