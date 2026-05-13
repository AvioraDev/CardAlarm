do $$
declare
  status_constraint_name text;
begin
  select c.conname
  into status_constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'alerts'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%status%'
    and pg_get_constraintdef(c.oid) ilike '%pending%'
    and pg_get_constraintdef(c.oid) ilike '%suppressed%'
  limit 1;

  if status_constraint_name is not null then
    execute format('alter table public.alerts drop constraint %I', status_constraint_name);
  end if;
end $$;

alter table public.alerts
  add constraint alerts_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'suppressed'));

create index if not exists idx_alerts_claimable
  on public.alerts (status, next_attempt_at, attempts, created_at)
  where status in ('pending', 'failed');

create index if not exists idx_alerts_processing_stale
  on public.alerts (updated_at)
  where status = 'processing';
