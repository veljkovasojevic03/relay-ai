-- Phase 6: handoff, inbox and Realtime.
-- Status flow: bot → waiting_human (handoff) → human (owner replied) → resolved.

-- ---------------------------------------------------------------------------------------
-- Realtime: the owner's inbox listens to postgres_changes on these tables. RLS applies to
-- every change event, so an owner only receives rows of their own bots.
-- ---------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;
alter publication supabase_realtime add table public.conversations, public.messages;

-- The inbox list sorts by latest activity of the owner's conversations.
alter table public.conversations
  add column last_message_at timestamptz not null default now(),
  add column last_message_preview text check (char_length(last_message_preview) <= 160),
  add column last_message_role text
    check (last_message_role in ('visitor', 'bot', 'human', 'system'));
create index conversations_bot_activity_idx
  on public.conversations (bot_id, last_message_at desc);

-- Any new message moves its conversation up the inbox and becomes its preview line.
create or replace function private.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         last_message_preview = left(regexp_replace(new.content, '\s+', ' ', 'g'), 160),
         last_message_role = new.role
   where id = new.conversation_id;
  return new;
end;
$$;
revoke all on function private.touch_conversation() from public;

create trigger messages_touch_conversation after insert on public.messages
  for each row execute function private.touch_conversation();

-- ---------------------------------------------------------------------------------------
-- Visitor messages after a handoff mark the conversation unread for the owner.
-- ---------------------------------------------------------------------------------------
create or replace function public.add_visitor_message(
  p_conversation_id uuid,
  p_bot_id uuid,
  p_content text,
  p_language text,
  p_max_messages integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_count integer;
  v_message_id uuid;
begin
  update public.conversations c
     set visitor_message_count = c.visitor_message_count + 1,
         last_visitor_activity_at = now(),
         owner_unread = c.owner_unread or c.status in ('waiting_human', 'human'),
         -- The bot replies in the visitor's latest language.
         language = case when p_language in ('en', 'sr') then p_language else c.language end
   where c.id = p_conversation_id
     and c.bot_id = p_bot_id
     and c.status <> 'resolved'
     and c.visitor_message_count < p_max_messages
  returning c.status, c.visitor_message_count into v_status, v_count;

  if not found then
    select c.status into v_status
      from public.conversations c
     where c.id = p_conversation_id and c.bot_id = p_bot_id;
    if not found then
      return jsonb_build_object('status', 'not_found');
    end if;
    return jsonb_build_object(
      'status', case when v_status = 'resolved' then 'closed' else 'cap_reached' end
    );
  end if;

  insert into public.messages (conversation_id, bot_id, role, content)
  values (p_conversation_id, p_bot_id, 'visitor', p_content)
  returning id into v_message_id;

  return jsonb_build_object(
    'status', 'ok',
    'message_id', v_message_id,
    'conversation_status', v_status,
    'visitor_message_count', v_count
  );
end;
$$;

-- ---------------------------------------------------------------------------------------
-- request_handoff: bot → waiting_human, once. Stores the optional visitor email, adds the
-- system message the visitor sees, and enqueues the owner's `escalation` event in the
-- outbox, all in one transaction (the outbox row exists if and only if the handoff does).
--
-- `p_escalation` is the event body built by the app (bot, owner, data); the visitor email
-- inside it is filled in here from the stored value. Calling it again (a second click, or
-- an email given after the handoff) only updates the email.
-- Returns {status: handed_off | already | closed | not_found, conversation_status, message_id}.
-- ---------------------------------------------------------------------------------------
create or replace function public.request_handoff(
  p_conversation_id uuid,
  p_bot_id uuid,
  p_reason text,
  p_email text,
  p_system_message text,
  p_escalation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_email text;
  v_owner uuid;
  v_message_id uuid;
begin
  if p_reason not in ('unknown_twice', 'requested', 'action_failed') then
    raise exception 'invalid reason %', p_reason using errcode = '22023';
  end if;

  select c.status into v_status
    from public.conversations c
   where c.id = p_conversation_id and c.bot_id = p_bot_id
   for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_status = 'resolved' then
    return jsonb_build_object('status', 'closed', 'conversation_status', v_status);
  end if;

  if nullif(btrim(p_email), '') is not null then
    update public.conversations
       set visitor_email = lower(btrim(p_email))
     where id = p_conversation_id;
  end if;

  if v_status <> 'bot' then
    return jsonb_build_object('status', 'already', 'conversation_status', v_status);
  end if;

  update public.conversations
     set status = 'waiting_human',
         handed_off_at = now(),
         owner_unread = true
   where id = p_conversation_id
  returning visitor_email into v_email;

  insert into public.messages (conversation_id, bot_id, role, content, meta)
  values (p_conversation_id, p_bot_id, 'system', p_system_message,
          jsonb_build_object('kind', 'handoff', 'reason', p_reason))
  returning id into v_message_id;

  select b.owner_id into v_owner from public.bots b where b.id = p_bot_id;

  insert into public.n8n_outbox (owner_id, type, payload)
  values (
    v_owner,
    'escalation',
    jsonb_set(
      p_escalation,
      '{data}',
      (p_escalation -> 'data')
        || jsonb_build_object('conversationId', p_conversation_id, 'reason', p_reason)
        || case when v_email is null then '{}'::jsonb
                else jsonb_build_object('visitorEmail', v_email) end
    )
  );

  return jsonb_build_object(
    'status', 'handed_off',
    'conversation_status', 'waiting_human',
    'message_id', v_message_id
  );
end;
$$;

-- ---------------------------------------------------------------------------------------
-- owner_reply: the signed-in owner answers in the inbox. Checks ownership itself (SECURITY
-- DEFINER, because owners can't insert messages directly), stores the human message,
-- moves the chat to `human`, and when the visitor left an email and has been away for more
-- than three minutes, enqueues a `reply_email` event in the same transaction.
-- `p_reply_email` is the event body built by the app; the stored email is filled in here.
-- Returns {status: ok | not_found | closed, message_id, emailed, realtime_channel}.
-- ---------------------------------------------------------------------------------------
create or replace function public.owner_reply(
  p_conversation_id uuid,
  p_content text,
  p_reply_email jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bot uuid;
  v_status text;
  v_email text;
  v_last_active timestamptz;
  v_channel text;
  v_owner uuid := (select auth.uid());
  v_message_id uuid;
  v_emailed boolean := false;
begin
  if v_owner is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_content, ''))) not between 1 and 4000 then
    raise exception 'invalid reply' using errcode = '22023';
  end if;

  select c.bot_id, c.status, c.visitor_email, c.last_visitor_activity_at, c.realtime_channel
    into v_bot, v_status, v_email, v_last_active, v_channel
    from public.conversations c
    join public.bots b on b.id = c.bot_id
   where c.id = p_conversation_id
     and b.owner_id = v_owner
   for update of c;
  -- Someone else's conversation looks exactly like a missing one.
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_status = 'resolved' then
    return jsonb_build_object('status', 'closed');
  end if;

  insert into public.messages (conversation_id, bot_id, role, content)
  values (p_conversation_id, v_bot, 'human', btrim(p_content))
  returning id into v_message_id;

  update public.conversations
     set status = 'human',
         owner_unread = false,
         handed_off_at = coalesce(handed_off_at, now())
   where id = p_conversation_id;

  if v_email is not null
     and v_last_active < now() - interval '3 minutes'
     and p_reply_email is not null then
    insert into public.n8n_outbox (owner_id, type, payload)
    values (
      v_owner,
      'reply_email',
      jsonb_set(
        p_reply_email,
        '{data}',
        (p_reply_email -> 'data')
          || jsonb_build_object('conversationId', p_conversation_id, 'visitorEmail', v_email)
      )
    );
    v_emailed := true;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'message_id', v_message_id,
    'emailed', v_emailed,
    'realtime_channel', v_channel
  );
end;
$$;

-- A visitor whose widget is open counts as present (the widget pings while waiting).
create or replace function public.touch_visitor_activity(p_conversation_id uuid, p_bot_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversations
     set last_visitor_activity_at = now()
   where id = p_conversation_id
     and bot_id = p_bot_id
     and last_visitor_activity_at < now() - interval '30 seconds';
$$;

revoke all on function public.request_handoff(uuid, uuid, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.owner_reply(uuid, text, jsonb) from public, anon;
revoke all on function public.touch_visitor_activity(uuid, uuid) from public, anon, authenticated;

grant execute on function public.request_handoff(uuid, uuid, text, text, text, jsonb)
  to service_role;
grant execute on function public.owner_reply(uuid, text, jsonb) to authenticated;
grant execute on function public.touch_visitor_activity(uuid, uuid) to service_role;
