-- Listing photo cache (shared across users: one provider call serves everyone) + per-call API usage ledger. Safe to run more than once.
create table if not exists listing_media_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default '00000000-0000-0000-0000-000000000000',
  provider text not null,
  normalized_address text not null,
  listing_id text,
  property_id text,
  provider_property_id text,
  photos_json jsonb not null default '[]'::jsonb,
  photo_count integer not null default 0,
  status text not null default 'ok',
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists listing_media_cache_addr_uq on listing_media_cache(provider, normalized_address);
create index if not exists listing_media_cache_listing_idx on listing_media_cache(listing_id) where listing_id is not null;
create index if not exists listing_media_cache_provider_pid_idx on listing_media_cache(provider, provider_property_id) where provider_property_id is not null;
create index if not exists listing_media_cache_expiry_idx on listing_media_cache(expires_at);
alter table listing_media_cache enable row level security; -- no policies: server (service role) only

create table if not exists api_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  endpoint text not null,
  success boolean not null default true,
  est_cost_usd numeric not null default 0,
  units numeric not null default 0,
  property_id text,
  detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists api_usage_user_time_idx on api_usage(user_id, created_at desc);
create index if not exists api_usage_provider_time_idx on api_usage(provider, created_at desc);
alter table api_usage enable row level security; -- no policies: server (service role) only
