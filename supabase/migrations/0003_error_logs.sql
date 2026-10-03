-- Owner-visible error / "didn't understand" log. Written by the server (service role) only. Safe to run more than once.
create table if not exists error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default '00000000-0000-0000-0000-000000000000',
  level text not null default 'error',
  source text not null default 'api',
  message text not null,
  stack text,
  route text,
  user_email text,
  detail jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists error_logs_time_idx on error_logs(created_at desc);
create index if not exists error_logs_status_idx on error_logs(status, source);
alter table error_logs enable row level security; -- no policies: only the server (service role) can read or write
