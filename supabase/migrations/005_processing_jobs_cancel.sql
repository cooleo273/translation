-- Allow jobs to be canceled by the user.
-- Note: `processing_jobs.status` uses a CHECK constraint created in 003_monetization.sql.

do $$
begin
  -- Drop the old constraint if it exists (name is deterministic in Postgres).
  if exists (
    select 1
    from pg_constraint
    where conname = 'processing_jobs_status_check'
  ) then
    alter table public.processing_jobs
      drop constraint processing_jobs_status_check;
  end if;

  -- Recreate with the added `canceled` state.
  alter table public.processing_jobs
    add constraint processing_jobs_status_check
    check (status in ('queued', 'active', 'completed', 'failed', 'canceled'));
end $$;

