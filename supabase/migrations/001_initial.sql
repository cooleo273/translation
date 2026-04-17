-- Run in Supabase SQL editor or via CLI. Enables RLS and app tables.

-- Profiles mirror auth.users (email sync via trigger optional)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Files uploaded / processed for each user
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  file_name text not null,
  file_type text not null,
  status text not null default 'pending',
  original_url text,
  processed_url jsonb,
  metadata jsonb default '{}'::jsonb,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists files_user_id_idx on public.files (user_id);
create index if not exists files_created_at_idx on public.files (created_at desc);

alter table public.files enable row level security;

create policy "Users manage own files"
  on public.files for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Primary translation row per processing run (latest can be joined with versions)
create table if not exists public.translations (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files (id) on delete cascade,
  detected_language text,
  translated_text text,
  original_text text,
  target_language text not null default 'English',
  mode text not null default 'standard',
  custom_prompt text,
  document_type text,
  created_at timestamptz not null default now()
);

create index if not exists translations_file_id_idx on public.translations (file_id);

alter table public.translations enable row level security;

create policy "Users read translations for own files"
  on public.translations for select
  using (
    exists (
      select 1 from public.files f
      where f.id = translations.file_id and f.user_id = auth.uid()
    )
  );

create policy "Users insert translations for own files"
  on public.translations for insert
  with check (
    exists (
      select 1 from public.files f
      where f.id = translations.file_id and f.user_id = auth.uid()
    )
  );

create policy "Users update translations for own files"
  on public.translations for update
  using (
    exists (
      select 1 from public.files f
      where f.id = translations.file_id and f.user_id = auth.uid()
    )
  );

create policy "Users delete translations for own files"
  on public.translations for delete
  using (
    exists (
      select 1 from public.files f
      where f.id = translations.file_id and f.user_id = auth.uid()
    )
  );

-- Version history for edited translations
create table if not exists public.translation_versions (
  id uuid primary key default gen_random_uuid(),
  translation_id uuid not null references public.translations (id) on delete cascade,
  translated_text text not null,
  version integer not null,
  created_at timestamptz not null default now(),
  unique (translation_id, version)
);

alter table public.translation_versions enable row level security;

create policy "Users read versions for own translations"
  on public.translation_versions for select
  using (
    exists (
      select 1 from public.translations t
      join public.files f on f.id = t.file_id
      where t.id = translation_versions.translation_id and f.user_id = auth.uid()
    )
  );

create policy "Users insert versions for own translations"
  on public.translation_versions for insert
  with check (
    exists (
      select 1 from public.translations t
      join public.files f on f.id = t.file_id
      where t.id = translation_versions.translation_id and f.user_id = auth.uid()
    )
  );

-- Usage aggregates for billing
create table if not exists public.usage_stats (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  files_processed integer not null default 0,
  words_translated bigint not null default 0,
  audio_seconds_processed integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.usage_stats enable row level security;

create policy "Users read own usage"
  on public.usage_stats for select
  using (auth.uid() = user_id);

create policy "Users update own usage"
  on public.usage_stats for update
  using (auth.uid() = user_id);

-- Auto-create profile on signup
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
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
