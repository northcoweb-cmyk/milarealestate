-- One-tap feedback on Mila's output ("useful", "missing something", "wrong"). Safe to run more than once.
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  kind text not null check (kind in ('useful','missing','wrong')),
  target text not null default 'chat',
  target_id text,
  note text,
  snippet text,
  page text
);
create index if not exists feedback_time_idx on feedback (created_at desc);
create index if not exists feedback_user_idx on feedback (user_id);
alter table feedback enable row level security;
drop policy if exists feedback_owner on feedback;
create policy feedback_owner on feedback for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
