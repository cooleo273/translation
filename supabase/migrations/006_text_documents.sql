-- Dashboard text translation workflow (no uploaded file required)

create table if not exists public.text_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'Text',
  original_text text not null,
  translated_text text not null,
  detected_language text,
  target_language text not null default 'English',
  mode text not null default 'standard',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists text_documents_user_idx on public.text_documents (user_id, created_at desc);

alter table public.text_documents enable row level security;

create policy "Users manage own text documents"
  on public.text_documents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.text_versions (
  id uuid primary key default gen_random_uuid(),
  text_document_id uuid not null references public.text_documents (id) on delete cascade,
  translated_text text not null,
  version integer not null,
  created_at timestamptz not null default now(),
  unique (text_document_id, version)
);

create index if not exists text_versions_doc_idx on public.text_versions (text_document_id, created_at desc);

alter table public.text_versions enable row level security;

create policy "Users read versions for own text documents"
  on public.text_versions for select
  using (
    exists (
      select 1 from public.text_documents d
      where d.id = text_versions.text_document_id and d.user_id = auth.uid()
    )
  );

create policy "Users insert versions for own text documents"
  on public.text_versions for insert
  with check (
    exists (
      select 1 from public.text_documents d
      where d.id = text_versions.text_document_id and d.user_id = auth.uid()
    )
  );

