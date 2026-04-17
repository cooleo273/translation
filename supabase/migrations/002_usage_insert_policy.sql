-- Allow authenticated users to upsert their own usage row (for app-level increments).
create policy "Users insert own usage"
  on public.usage_stats for insert
  with check (auth.uid() = user_id);
