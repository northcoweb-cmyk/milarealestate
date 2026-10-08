-- Bug reports from test agents: same table as feedback, plus where it is in the fix queue and the GitHub issue an agent reads. Safe to run more than once.
alter table feedback drop constraint if exists feedback_kind_check;
alter table feedback add constraint feedback_kind_check check (kind in ('useful','missing','wrong','bug'));
alter table feedback add column if not exists category text;
alter table feedback add column if not exists context jsonb;
alter table feedback add column if not exists status text not null default 'open';
alter table feedback add column if not exists github_issue integer;
