-- Monetization: subscriptions, API keys, usage logs, jobs, cache, Stripe idempotency

-- Subscriptions (one row per user; synced from Stripe for paid tiers)
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  plan_name text not null default 'free' check (plan_name in ('free', 'pro', 'business')),
  start_date timestamptz not null default now(),
  end_date timestamptz,
  status text not null default 'active' check (status in ('active', 'canceled', 'past_due', 'trialing')),
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_stripe_customer_idx on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

create policy "Users read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- API keys (secret stored as hash only)
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  key_prefix text not null,
  key_hash text not null,
  name text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists api_keys_user_id_idx on public.api_keys (user_id);
create unique index if not exists api_keys_key_hash_idx on public.api_keys (key_hash);

alter table public.api_keys enable row level security;

create policy "Users manage own api keys"
  on public.api_keys for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Usage logs (PAYG and analytics)
create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  file_id uuid references public.files (id) on delete set null,
  api_key_id uuid references public.api_keys (id) on delete set null,
  type text not null check (type in ('doc', 'audio', 'video', 'ocr', 'spreadsheet')),
  usage_amount numeric not null default 0,
  cost numeric not null default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_logs_user_created_idx on public.usage_logs (user_id, created_at desc);
create index if not exists usage_logs_file_id_idx on public.usage_logs (file_id);

alter table public.usage_logs enable row level security;

create policy "Users read own usage logs"
  on public.usage_logs for select
  using (auth.uid() = user_id);

create policy "Users insert own usage logs"
  on public.usage_logs for insert
  with check (auth.uid() = user_id);

-- Background jobs (durable state alongside Redis/BullMQ)
create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  file_id uuid references public.files (id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'active', 'completed', 'failed')),
  queue_name text not null default 'default',
  payload jsonb default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists processing_jobs_user_idx on public.processing_jobs (user_id, created_at desc);
create index if not exists processing_jobs_status_idx on public.processing_jobs (status);

alter table public.processing_jobs enable row level security;

create policy "Users read own jobs"
  on public.processing_jobs for select
  using (auth.uid() = user_id);

create policy "Users insert own jobs"
  on public.processing_jobs for insert
  with check (auth.uid() = user_id);

create policy "Users update own jobs"
  on public.processing_jobs for update
  using (auth.uid() = user_id);

-- Translation result cache (dedupe)
create table if not exists public.translation_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content_hash text not null,
  options_hash text not null default '',
  cache_version text not null default '1',
  result jsonb not null,
  file_id uuid references public.files (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, content_hash, options_hash, cache_version)
);

create index if not exists translation_cache_lookup_idx on public.translation_cache (user_id, content_hash, options_hash, cache_version);

alter table public.translation_cache enable row level security;

create policy "Users read own cache"
  on public.translation_cache for select
  using (auth.uid() = user_id);

create policy "Users insert own cache"
  on public.translation_cache for insert
  with check (auth.uid() = user_id);

create policy "Users update own cache"
  on public.translation_cache for update
  using (auth.uid() = user_id);

create policy "Users delete own cache"
  on public.translation_cache for delete
  using (auth.uid() = user_id);

-- Stripe webhook idempotency
create table if not exists public.stripe_events (
  id text primary key,
  processed_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
-- No policies: only service role (bypasses RLS) writes for idempotent webhooks.

-- Content hash for dedupe (optional column on files)
alter table public.files add column if not exists content_sha256 text;

-- Extend signup: profile + usage_stats + default free subscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  insert into public.usage_stats (user_id) values (new.id);
  insert into public.subscriptions (user_id, plan_name, status, start_date)
  values (new.id, 'free', 'active', now());
  return new;
end;
$$;

-- Backfill subscriptions for existing users
insert into public.subscriptions (user_id, plan_name, status, start_date)
select p.id, 'free', 'active', p.created_at
from public.profiles p
where not exists (select 1 from public.subscriptions s where s.user_id = p.id)
on conflict (user_id) do nothing;
