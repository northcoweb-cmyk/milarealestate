-- Pre-launch waitlist. Your waitlist page writes here; the Mila OS dashboard reads it. Safe to run more than once.
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  source text,            -- e.g. instagram, tiktok, x (from ?src= on the link)
  status text not null default 'waiting',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists waitlist_email_uq on waitlist (lower(email));
create index if not exists waitlist_time_idx on waitlist (created_at desc);
alter table waitlist enable row level security;
-- The public waitlist page may ADD a row with the anon key, but can never read, change or delete anyone's.
drop policy if exists waitlist_insert on waitlist;
create policy waitlist_insert on waitlist for insert to anon with check (true);
