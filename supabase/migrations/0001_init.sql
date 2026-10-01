-- Mila schema. Generated to match src/lib/types.ts.
-- Every user-owned table has user_id + Row Level Security: users can only see/modify their own rows.
-- The server uses the service-role key (which bypasses RLS) but ALWAYS filters by user_id; RLS protects any direct client access.

create extension if not exists pgcrypto;

create or replace function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null default 'Agent',
  brokerage text,
  location text not null default '',
  primary_market text not null default '',
  timezone text not null default 'America/New_York',
  lat double precision,
  lng double precision,
  experience text not null default 'growing' check (experience in ('new','growing','experienced','team')),
  business_type text not null default 'mixed' check (business_type in ('buyer','seller','rental','commercial','investor','mixed')),
  onboarded boolean not null default false,
  is_demo boolean not null default false,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists profiles_updated on profiles; create trigger profiles_updated before update on profiles for each row execute function set_updated_at();
alter table profiles enable row level security;
drop policy if exists profiles_owner on profiles;
create policy profiles_owner on profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  license_state text,
  signature text,
  service_areas text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists businesses_user_idx on businesses(user_id);
drop trigger if exists businesses_updated on businesses; create trigger businesses_updated before update on businesses for each row execute function set_updated_at();
alter table businesses enable row level security;
drop policy if exists businesses_owner on businesses;
create policy businesses_owner on businesses for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  type text not null default 'lead' check (type in ('buyer','seller','rental','investor','past_client','lead','vendor','agent','other')),
  status text not null default 'new' check (status in ('new','contacted','qualified','active','showing','offer','under_contract','closed','nurture','inactive')),
  tags text[] not null default '{}',
  notes text,
  preferences jsonb not null default '{}',
  location text,
  budget_min numeric,
  budget_max numeric,
  timeline text,
  source text,
  importance smallint not null default 2 check (importance between 1 and 3),
  last_contact_at timestamptz,
  next_action text,
  next_action_at timestamptz,
  avatar_color text not null default '#7C9CBF',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_user_idx on contacts(user_id);
drop trigger if exists contacts_updated on contacts; create trigger contacts_updated before update on contacts for each row execute function set_updated_at();
alter table contacts enable row level security;
drop policy if exists contacts_owner on contacts;
create policy contacts_owner on contacts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists contact_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contact_notes_user_idx on contact_notes(user_id);
drop trigger if exists contact_notes_updated on contact_notes; create trigger contact_notes_updated before update on contact_notes for each row execute function set_updated_at();
alter table contact_notes enable row level security;
drop policy if exists contact_notes_owner on contact_notes;
create policy contact_notes_owner on contact_notes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists contact_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  kind text not null,
  title text not null,
  detail text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contact_events_user_idx on contact_events(user_id);
drop trigger if exists contact_events_updated on contact_events; create trigger contact_events_updated before update on contact_events for each row execute function set_updated_at();
alter table contact_events enable row level security;
drop policy if exists contact_events_owner on contact_events;
create policy contact_events_owner on contact_events for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  address text not null,
  city text,
  state text,
  zip text,
  county text,
  list_price numeric,
  beds numeric,
  baths numeric,
  sqft integer,
  listing_url text,
  description text,
  verified boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists properties_user_idx on properties(user_id);
drop trigger if exists properties_updated on properties; create trigger properties_updated before update on properties for each row execute function set_updated_at();
alter table properties enable row level security;
drop policy if exists properties_owner on properties;
create policy properties_owner on properties for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null,
  mime text not null,
  size_bytes bigint not null default 0,
  storage_path text not null,
  text_content text,
  extracted jsonb,
  property_id uuid references properties(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists documents_user_idx on documents(user_id);
drop trigger if exists documents_updated on documents; create trigger documents_updated before update on documents for each row execute function set_updated_at();
alter table documents enable row level security;
drop policy if exists documents_owner on documents;
create policy documents_owner on documents for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists property_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  url text not null,
  caption text,
  position integer not null default 0,
  source text not null default 'upload',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists property_images_user_idx on property_images(user_id);
drop trigger if exists property_images_updated on property_images; create trigger property_images_updated before update on property_images for each row execute function set_updated_at();
alter table property_images enable row level security;
drop policy if exists property_images_owner on property_images;
create policy property_images_owner on property_images for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  name text not null,
  description text not null default '',
  steps jsonb not null default '[]',
  is_builtin boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workflows_user_idx on workflows(user_id);
drop trigger if exists workflows_updated on workflows; create trigger workflows_updated before update on workflows for each row execute function set_updated_at();
alter table workflows enable row level security;
drop policy if exists workflows_owner on workflows;
create policy workflows_owner on workflows for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow_key text not null,
  title text not null,
  subtitle text,
  status text not null default 'running',
  params jsonb not null default '{}',
  plan jsonb not null default '[]',
  outputs jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workflow_runs_user_idx on workflow_runs(user_id);
drop trigger if exists workflow_runs_updated on workflow_runs; create trigger workflow_runs_updated before update on workflow_runs for each row execute function set_updated_at();
alter table workflow_runs enable row level security;
drop policy if exists workflow_runs_owner on workflow_runs;
create policy workflow_runs_owner on workflow_runs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  kind text not null default 'other',
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  location text,
  property_id uuid references properties(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  source text not null default 'mila',
  external_id text,
  synced_at timestamptz,
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calendar_events_user_idx on calendar_events(user_id);
drop trigger if exists calendar_events_updated on calendar_events; create trigger calendar_events_updated before update on calendar_events for each row execute function set_updated_at();
alter table calendar_events enable row level security;
drop policy if exists calendar_events_owner on calendar_events;
create policy calendar_events_owner on calendar_events for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  title text not null,
  summary text,
  payload jsonb not null,
  risk text not null default 'normal' check (risk in ('normal','high')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','executed','failed')),
  result jsonb,
  error text,
  blocked_integration text,
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  decided_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists approvals_user_idx on approvals(user_id);
drop trigger if exists approvals_updated on approvals; create trigger approvals_updated before update on approvals for each row execute function set_updated_at();
alter table approvals enable row level security;
drop policy if exists approvals_owner on approvals;
create policy approvals_owner on approvals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'task',
  title text not null,
  subtitle text,
  priority text not null default 'low' check (priority in ('urgent','important','upcoming','low')),
  priority_reason text,
  status text not null default 'open' check (status in ('open','done','dismissed')),
  due_at timestamptz,
  contact_id uuid references contacts(id) on delete cascade,
  property_id uuid references properties(id) on delete set null,
  approval_id uuid references approvals(id) on delete set null,
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_user_idx on tasks(user_id);
drop trigger if exists tasks_updated on tasks; create trigger tasks_updated before update on tasks for each row execute function set_updated_at();
alter table tasks enable row level security;
drop policy if exists tasks_owner on tasks;
create policy tasks_owner on tasks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists document_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null,
  body text not null,
  variables text[] not null default '{}',
  document_id uuid references documents(id) on delete set null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists document_templates_user_idx on document_templates(user_id);
drop trigger if exists document_templates_updated on document_templates; create trigger document_templates_updated before update on document_templates for each row execute function set_updated_at();
alter table document_templates enable row level security;
drop policy if exists document_templates_owner on document_templates;
create policy document_templates_owner on document_templates for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('user','contact','property','business','workflow')),
  subject_id uuid,
  key text not null,
  value text not null,
  source text not null default 'user_stated',
  confidence real not null default 1,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists memories_user_idx on memories(user_id);
drop trigger if exists memories_updated on memories; create trigger memories_updated before update on memories for each row execute function set_updated_at();
alter table memories enable row level security;
drop policy if exists memories_owner on memories;
create policy memories_owner on memories for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  direction text not null check (direction in ('in','out')),
  subject text not null,
  snippet text,
  external_id text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists emails_user_idx on emails(user_id);
drop trigger if exists emails_updated on emails; create trigger emails_updated before update on emails for each row execute function set_updated_at();
alter table emails enable row level security;
drop policy if exists emails_owner on emails;
create policy emails_owner on emails for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists email_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  to_contact_ids uuid[] not null default '{}',
  to_emails text[] not null default '{}',
  subject text not null,
  body text not null,
  status text not null default 'draft',
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  property_id uuid references properties(id) on delete set null,
  event_id uuid references calendar_events(id) on delete set null,
  stale boolean not null default false,
  stale_reason text,
  gmail_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_drafts_user_idx on email_drafts(user_id);
drop trigger if exists email_drafts_updated on email_drafts; create trigger email_drafts_updated before update on email_drafts for each row execute function set_updated_at();
alter table email_drafts enable row level security;
drop policy if exists email_drafts_owner on email_drafts;
create policy email_drafts_owner on email_drafts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  caption text not null,
  hashtags text[] not null default '{}',
  slides jsonb not null default '[]',
  status text not null default 'draft',
  property_id uuid references properties(id) on delete set null,
  event_id uuid references calendar_events(id) on delete set null,
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  scheduled_for timestamptz,
  stale boolean not null default false,
  stale_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_posts_user_idx on social_posts(user_id);
drop trigger if exists social_posts_updated on social_posts; create trigger social_posts_updated before update on social_posts for each row execute function set_updated_at();
alter table social_posts enable row level security;
drop policy if exists social_posts_owner on social_posts;
create policy social_posts_owner on social_posts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  remind_at timestamptz not null,
  channels text[] not null default '{pwa}',
  status text not null default 'pending',
  contact_id uuid references contacts(id) on delete cascade,
  event_id uuid references calendar_events(id) on delete cascade,
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reminders_user_idx on reminders(user_id);
drop trigger if exists reminders_updated on reminders; create trigger reminders_updated before update on reminders for each row execute function set_updated_at();
alter table reminders enable row level security;
drop policy if exists reminders_owner on reminders;
create policy reminders_owner on reminders for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null,
  title text not null,
  body text,
  status text not null default 'queued',
  related_task_id uuid references tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications(user_id);
drop trigger if exists notifications_updated on notifications; create trigger notifications_updated before update on notifications for each row execute function set_updated_at();
alter table notifications enable row level security;
drop policy if exists notifications_owner on notifications;
create policy notifications_owner on notifications for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'connected',
  account_label text,
  scopes text[] not null default '{}',
  token_encrypted text,
  error text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists integrations_user_idx on integrations(user_id);
drop trigger if exists integrations_updated on integrations; create trigger integrations_updated before update on integrations for each row execute function set_updated_at();
alter table integrations enable row level security;
drop policy if exists integrations_owner on integrations;
create policy integrations_owner on integrations for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  state jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_idx on conversations(user_id);
drop trigger if exists conversations_updated on conversations; create trigger conversations_updated before update on conversations for each row execute function set_updated_at();
alter table conversations enable row level security;
drop policy if exists conversations_owner on conversations;
create policy conversations_owner on conversations for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user','mila')),
  content text not null default '',
  blocks jsonb not null default '[]',
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists messages_user_idx on messages(user_id);
drop trigger if exists messages_updated on messages; create trigger messages_updated before update on messages for each row execute function set_updated_at();
alter table messages enable row level security;
drop policy if exists messages_owner on messages;
create policy messages_owner on messages for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  operation text not null,
  tier text not null default 'local',
  provider text not null default 'local',
  model text not null default 'rules-engine',
  input_units integer not null default 0,
  output_units integer not null default 0,
  est_cost_usd numeric(12,6) not null default 0,
  credits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists usage_user_idx on usage(user_id);
drop trigger if exists usage_updated on usage; create trigger usage_updated before update on usage for each row execute function set_updated_at();
alter table usage enable row level security;
drop policy if exists usage_owner on usage;
create policy usage_owner on usage for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('grant','spend','purchase','reset','adjust')),
  delta integer not null,
  balance_after integer not null,
  reason text not null,
  usage_id uuid references usage(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists credit_transactions_user_idx on credit_transactions(user_id);
drop trigger if exists credit_transactions_updated on credit_transactions; create trigger credit_transactions_updated before update on credit_transactions for each row execute function set_updated_at();
alter table credit_transactions enable row level security;
drop policy if exists credit_transactions_owner on credit_transactions;
create policy credit_transactions_owner on credit_transactions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null,
  status text not null default 'dev',
  credits_per_period integer not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on subscriptions(user_id);
drop trigger if exists subscriptions_updated on subscriptions; create trigger subscriptions_updated before update on subscriptions for each row execute function set_updated_at();
alter table subscriptions enable row level security;
drop policy if exists subscriptions_owner on subscriptions;
create policy subscriptions_owner on subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists contact_events_contact_idx on contact_events(contact_id, occurred_at desc);
create index if not exists calendar_events_time_idx on calendar_events(user_id, start_at);
create index if not exists tasks_open_idx on tasks(user_id, status, priority);
create index if not exists memories_subject_idx on memories(user_id, scope, subject_id);
create index if not exists usage_user_time_idx on usage(user_id, created_at desc);
create unique index if not exists workflows_key_idx on workflows(user_id, key);
create index if not exists reminders_due_idx on reminders(status, remind_at);

-- Integration tokens are encrypted by the app, but also hidden from direct client reads:
revoke select (token_encrypted) on integrations from authenticated, anon;

-- Global owner configuration (credit costs, plans). Readable/writable only via the service role.
create table if not exists app_config (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
alter table app_config enable row level security;

-- Private file bucket used for uploads (accessed only through /api/files with an ownership check).
insert into storage.buckets (id, name, public) values ('mila-files','mila-files', false) on conflict (id) do nothing;
