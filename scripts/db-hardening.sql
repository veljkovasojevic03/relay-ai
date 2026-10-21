-- Catalog checks for spec §5 (CI runs this against the local stack after the migrations):
-- every table in `public` has row-level security, and every SECURITY DEFINER function in
-- `public` pins its search_path. Fails with the offending names.
do $$
declare
  v_tables text;
  v_functions text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_tables
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;

  select string_agg(p.proname, ', ' order by p.proname) into v_functions
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) setting
        where setting like 'search_path=%'
     );

  if v_tables is not null then
    raise exception 'tables without row-level security: %', v_tables;
  end if;
  if v_functions is not null then
    raise exception 'SECURITY DEFINER functions without a pinned search_path: %', v_functions;
  end if;
  raise notice 'ok: RLS on every public table, search_path pinned on every SECURITY DEFINER function';
end
$$;
