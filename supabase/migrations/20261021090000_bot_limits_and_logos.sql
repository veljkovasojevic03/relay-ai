-- Phase 2: plan limit on bots, and the storage bucket for bot logos.

-- Bots per plan (spec §4.9).
create or replace function public.plan_bot_limit(p_plan text)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_plan when 'pro' then 3 else 1 end;
$$;

revoke all on function public.plan_bot_limit(text) from public, anon;
grant execute on function public.plan_bot_limit(text) to authenticated, service_role;

-- Enforced in the database so no code path can skip it. A per-owner advisory lock
-- serializes concurrent inserts, so two parallel "create bot" requests can't both pass the
-- count check.
create or replace function private.enforce_bot_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('bot_limit:' || new.owner_id::text, 0));

  select p.plan into v_plan from public.profiles p where p.id = new.owner_id;
  select count(*) into v_count from public.bots b where b.owner_id = new.owner_id;

  if v_count >= public.plan_bot_limit(v_plan) then
    raise exception using
      errcode = 'P0001',
      message = 'bot_limit_reached',
      detail = format('plan %s allows %s bot(s)', coalesce(v_plan, 'free'), public.plan_bot_limit(v_plan));
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_bot_limit() from public;

create trigger bots_enforce_limit before insert on public.bots
  for each row execute function private.enforce_bot_limit();

-- ---------------------------------------------------------------------------------------
-- Logos: public read (the widget shows them on third-party sites), owner-only writes into
-- a folder named after a bot they own: `<bot_id>/<random>.<ext>`. The bucket itself
-- rejects anything over 200 KB and anything that isn't PNG, JPEG or WebP (no SVG: it can
-- carry script). The app additionally checks magic bytes before uploading.
-- ---------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bot-logos', 'bot-logos', true, 204800, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- First path segment as a bot id, or null when it isn't a uuid (never raises).
create or replace function private.logo_bot_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

revoke all on function private.logo_bot_id(text) from public;
grant execute on function private.logo_bot_id(text) to authenticated;

create policy bot_logos_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bot-logos' and private.owns_bot(private.logo_bot_id(name)));

create policy bot_logos_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'bot-logos' and private.owns_bot(private.logo_bot_id(name)))
  with check (bucket_id = 'bot-logos' and private.owns_bot(private.logo_bot_id(name)));

create policy bot_logos_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'bot-logos' and private.owns_bot(private.logo_bot_id(name)));

-- Owners can list their own logo objects (needed for upsert/delete); public URLs don't
-- need a SELECT policy.
create policy bot_logos_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'bot-logos' and private.owns_bot(private.logo_bot_id(name)));
