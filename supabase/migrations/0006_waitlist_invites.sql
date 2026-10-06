-- Launch-day invites for the waitlist. Safe to run more than once. Run AFTER 0005_waitlist.sql.
alter table waitlist add column if not exists user_id uuid not null default '00000000-0000-0000-0000-000000000000';
alter table waitlist add column if not exists invite_token text;
alter table waitlist add column if not exists invited_at timestamptz;      -- when the launch-day invite was emailed
alter table waitlist add column if not exists email_sent_at timestamptz;   -- when the "you're on the list" email was sent
alter table waitlist add column if not exists claimed_at timestamptz;      -- when they created their password and account
alter table waitlist add column if not exists account_id uuid;             -- their Mila account, once claimed
create unique index if not exists waitlist_invite_token_uq on waitlist (invite_token) where invite_token is not null;
-- Signups go through the waitlist site's server (service role), never straight from a browser: remove the public insert door.
drop policy if exists waitlist_insert on waitlist;
