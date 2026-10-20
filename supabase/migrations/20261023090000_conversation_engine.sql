-- Phase 4: conversation engine. Each step of a widget turn is one atomic function, called by
-- the widget API with the service role (never by owners or visitors directly).

-- ---------------------------------------------------------------------------------------
-- bot_accepts_conversations: may a NEW conversation start right now? (active bot, owner
-- under the monthly quota). Display only, for the widget's `available` flag; the real check
-- is start_conversation's atomic increment.
-- ---------------------------------------------------------------------------------------
create or replace function public.bot_accepts_conversations(p_bot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select b.active
           and coalesce(u.conversations_started, 0) < public.plan_conversation_limit(p.plan)
      from public.bots b
      join public.profiles p on p.id = b.owner_id
      left join public.usage_counters u
        on u.profile_id = b.owner_id
       and u.period = to_char(now() at time zone 'utc', 'YYYY-MM')
     where b.id = p_bot_id
  ), false);
$$;

-- ---------------------------------------------------------------------------------------
-- add_visitor_message: counts and stores one visitor message. The per-conversation cap is
-- enforced by the UPDATE's WHERE clause, so parallel requests can never exceed it.
-- Returns {status: ok, message_id, conversation_status, visitor_message_count}
--      or {status: not_found | closed | cap_reached}.
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
-- record_bot_reply: stores the bot's reply and updates the conversation in one step.
--   answered → unknown_streak resets to 0
--   unknown  → unknown_streak + 1 and an unknown_questions row for the owner
--   degraded → retrieval was unavailable; nothing counts against the bot
-- first_response_ms is set once, on the first reply.
-- Returns {message_id, unknown_streak}.
-- ---------------------------------------------------------------------------------------
create or replace function public.record_bot_reply(
  p_conversation_id uuid,
  p_bot_id uuid,
  p_content text,
  p_source_faq_ids uuid[],
  p_meta jsonb,
  p_outcome text,
  p_question text,
  p_language text,
  p_first_response_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message_id uuid;
  v_streak integer;
begin
  if p_outcome not in ('answered', 'unknown', 'degraded') then
    raise exception 'invalid outcome %', p_outcome using errcode = '22023';
  end if;

  update public.conversations c
     set unknown_streak = case p_outcome
                            when 'answered' then 0
                            when 'unknown' then c.unknown_streak + 1
                            else c.unknown_streak
                          end,
         first_response_ms = coalesce(c.first_response_ms, greatest(p_first_response_ms, 0))
   where c.id = p_conversation_id and c.bot_id = p_bot_id
  returning c.unknown_streak into v_streak;

  if not found then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;

  insert into public.messages (conversation_id, bot_id, role, content, source_faq_ids, meta)
  values (
    p_conversation_id,
    p_bot_id,
    'bot',
    p_content,
    coalesce(p_source_faq_ids, '{}'),
    coalesce(p_meta, '{}'::jsonb)
  )
  returning id into v_message_id;

  if p_outcome = 'unknown' then
    insert into public.unknown_questions (bot_id, conversation_id, question, language)
    values (
      p_bot_id,
      p_conversation_id,
      left(btrim(p_question), 500),
      case when p_language in ('en', 'sr') then p_language else 'en' end
    );
  end if;

  return jsonb_build_object('message_id', v_message_id, 'unknown_streak', v_streak);
end;
$$;

revoke all on function public.bot_accepts_conversations(uuid) from public, anon, authenticated;
revoke all on function public.add_visitor_message(uuid, uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.record_bot_reply(uuid, uuid, text, uuid[], jsonb, text, text, text, integer)
  from public, anon, authenticated;

grant execute on function public.bot_accepts_conversations(uuid) to service_role;
grant execute on function public.add_visitor_message(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.record_bot_reply(uuid, uuid, text, uuid[], jsonb, text, text, text, integer)
  to service_role;

-- Polling reads a conversation's messages in order (the index exists); visitors look up
-- their conversation by token hash (unique index exists).
