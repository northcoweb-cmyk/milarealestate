-- Daily counter for the public "Ask Mila" box on the waitlist site: a hard ceiling on how many AI answers can be paid for per day. Safe to run more than once.
create table if not exists site_chat_usage (
  day date primary key,
  calls integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table site_chat_usage enable row level security; -- no policies: only the server (service role) can touch it

create or replace function bump_site_chat(p_day date) returns integer
language sql security definer set search_path = public as $$
  insert into site_chat_usage (day, calls) values (p_day, 1)
  on conflict (day) do update set calls = site_chat_usage.calls + 1, updated_at = now()
  returning calls;
$$;
revoke all on function bump_site_chat(date) from public, anon, authenticated;
grant execute on function bump_site_chat(date) to service_role;
