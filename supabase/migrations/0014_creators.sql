-- Creator partner program: people who get Mila access, post 3 videos, and earn a free month. Safe to run more than once.
create table if not exists creators (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  handle text,
  platform text,                 -- tiktok | instagram | youtube | other
  followers integer,
  notes text,
  token text not null unique,    -- private link to their submission page
  status text not null default 'invited' check (status in ('invited','active','rewarded','expired','declined')),
  access_at timestamptz,         -- when access was granted (the clock starts)
  deadline_at timestamptz,       -- when the 3 videos are due
  reminders_sent integer not null default 0,
  last_reminded_at timestamptz,
  rewarded_at timestamptz,
  reward_ends_at timestamptz,    -- when the free month ends
  closed_note text
);
create unique index if not exists creators_email_idx on creators (lower(email));
create index if not exists creators_status_idx on creators (status, deadline_at);

create table if not exists creator_videos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  creator_id uuid not null references creators(id) on delete cascade,
  url text not null,
  platform text,
  views integer,
  status text not null default 'submitted' check (status in ('submitted','verified','changes','rejected')),
  checks jsonb not null default '{}'::jsonb,   -- shows_app, disclosure, tagged, no_claims
  note text,                                   -- what to fix, shown to the creator
  verified_at timestamptz
);
create index if not exists creator_videos_creator_idx on creator_videos (creator_id, created_at);

alter table creators enable row level security;       -- no policies: only the server key (Mila OS and the site's submit page) can read or write
alter table creator_videos enable row level security;
