-- Tracks who has already received the launch-countdown email, so a double click never sends it twice. Safe to run more than once.
alter table waitlist add column if not exists announced_at timestamptz;
