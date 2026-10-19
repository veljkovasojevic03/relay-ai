-- Lightweight round-trip used by /api/health and the cron keep-alive.
-- Touches no tables, so it is safe to call frequently and before any data exists.
create or replace function public.health_check()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select now();
$$;

revoke all on function public.health_check() from public, anon, authenticated;
grant execute on function public.health_check() to service_role;
