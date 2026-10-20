-- Phase 1 / 1 of 5: extensions, private helper schema, hardened defaults.

create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Helpers that must never be reachable through PostgREST live in `private`
-- (only `public` is exposed by the API).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Least privilege by default: tables and functions created by later migrations get
-- no access for API roles until a migration grants it explicitly.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Used by a CHECK constraint on bots.allowed_origins, so API roles need EXECUTE.
-- Accepts lowercase https origins with a dotted host (optional port), plus plain-http
-- localhost / 127.0.0.1 for local development. No paths, no trailing slash.
create or replace function public.is_valid_origin_list(origins text[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    bool_and(
      o ~ '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$'
      or o ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$'
    ),
    true
  )
  from unnest(origins) as o;
$$;

grant execute on function public.is_valid_origin_list(text[]) to anon, authenticated, service_role;
