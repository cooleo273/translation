-- User glossary (term base) for prompt injection
create table if not exists public.glossary_terms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_term text not null,
  target_term text not null,
  created_at timestamptz not null default now(),
  unique (user_id, source_term)
);

create index if not exists glossary_terms_user_idx on public.glossary_terms (user_id, created_at desc);

alter table public.glossary_terms enable row level security;

create policy "Users manage own glossary"
  on public.glossary_terms for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Outbound webhooks (job lifecycle)
create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  url text not null,
  secret text not null default '',
  events text[] not null default array['job.completed', 'job.failed']::text[],
  created_at timestamptz not null default now()
);

create index if not exists webhook_endpoints_user_idx on public.webhook_endpoints (user_id);

alter table public.webhook_endpoints enable row level security;

create policy "Users manage own webhooks"
  on public.webhook_endpoints for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
