-- Phase 9: demo store and sandbox (spec §4.10, Phase 9).

-- ---------------------------------------------------------------------------------------
-- Profile bootstrap: every anonymous user is a sandbox that expires after 7 days.
-- Set here rather than by the app, so no anonymous account can exist without an expiry
-- (also one created by calling Supabase Auth directly, bypassing the Turnstile check), and
-- `purge_expired_data` always removes it in the end.
-- ---------------------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(left(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  ), 80)), '');
  v_language text := new.raw_user_meta_data ->> 'ui_language';
  v_sandbox boolean := coalesce(new.is_anonymous, false);
begin
  insert into public.profiles (
    id, display_name, notification_email, ui_language, is_sandbox, sandbox_expires_at
  )
  values (
    new.id,
    v_name,
    new.email,
    case when v_language in ('en', 'sr') then v_language else 'en' end,
    v_sandbox,
    case when v_sandbox then now() + interval '7 days' end
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;
