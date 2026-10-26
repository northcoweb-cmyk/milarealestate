-- Creator program, round 2: outreach list, partner tier (monthly videos + commission), risk flags, payouts. Safe to run more than once.
alter table creators drop constraint if exists creators_status_check;
alter table creators add constraint creators_status_check check (status in ('prospect','invited','active','rewarded','partner','paused','expired','declined'));
alter table creators add column if not exists sent jsonb not null default '{}'::jsonb;          -- which nudge emails already went (signin, use, renewed month)
alter table creators add column if not exists tier text not null default 'creator' check (tier in ('creator','partner'));
alter table creators add column if not exists ref_code text;                                   -- their sign-up code, used in their link
create unique index if not exists creators_ref_code_idx on creators (ref_code) where ref_code is not null;
alter table creators add column if not exists commission_pct integer not null default 20;      -- percent of each referred payment
alter table creators add column if not exists commission_months integer not null default 12;   -- how many months each referral keeps paying commission
alter table creators add column if not exists videos_per_month integer not null default 2;
alter table creators add column if not exists partner_since timestamptz;
alter table creators add column if not exists contacted_at timestamptz;
alter table creators add column if not exists added_by text default 'ryan';
alter table creator_videos add column if not exists kind text not null default 'trial' check (kind in ('trial','partner'));
alter table creator_videos add column if not exists flags jsonb not null default '[]'::jsonb;  -- automatic warnings: duplicate link, handle mismatch...

create table if not exists partner_payouts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  creator_id uuid not null references creators(id) on delete cascade,
  period text not null,          -- YYYY-MM the commission is for
  amount_cents integer not null check (amount_cents > 0),
  note text
);
create index if not exists partner_payouts_creator_idx on partner_payouts (creator_id, period);
alter table partner_payouts enable row level security;
