-- Phase 7: n8n delivery, actions, demo orders (spec §4.7, §8).

-- ---------------------------------------------------------------------------------------
-- Outbox: `delivered` = n8n accepted the event (200) and its callback is still due.
-- pending → delivered → sent | failed (callback), pending → failed (retries exhausted),
-- pending → simulated (no n8n configured).
-- ---------------------------------------------------------------------------------------
alter table public.n8n_outbox drop constraint n8n_outbox_status_check;
alter table public.n8n_outbox add constraint n8n_outbox_status_check
  check (status in ('pending', 'delivered', 'sent', 'failed', 'simulated'));

-- ---------------------------------------------------------------------------------------
-- Guided action flows in Sample mode (spec §4.4): the step a conversation is on, e.g.
-- {"action": "order_status", "step": "email", "params": {"orderNumber": "KR-10482"}}.
-- Written only by the widget API (service role); null = no flow running.
-- ---------------------------------------------------------------------------------------
alter table public.conversations
  add column action_flow jsonb check (action_flow is null or jsonb_typeof(action_flow) = 'object');

-- ---------------------------------------------------------------------------------------
-- Demo orders for the demo bot's `order_status` action. Reference data, idempotent.
-- The "Try these" panel on /demo (Phase 9) lists the same numbers and emails.
-- ---------------------------------------------------------------------------------------
insert into public.demo_orders (order_number, email, status, eta, items)
values
  ('KR-10482', 'marko@example.com', 'shipped', '2026-10-24', '["Patike Trk", "Čarape Basic (3 para)"]'),
  ('KR-10377', 'ana.petrovic@example.com', 'delivered', '2026-10-12', '["Lanena košulja", "Kaiš Kožni"]'),
  ('KR-10519', 'jelena@example.com', 'processing', '2026-10-29', '["Haljina Leto", "Sandale Plaža"]'),
  ('KR-10233', 'nikola@example.com', 'cancelled', null, '["Jakna Vetar"]'),
  ('KR-10561', 'sara.jovanovic@example.com', 'shipped', '2026-10-23', '["Džemper Vuna", "Šal Mekani"]'),
  ('KR-10598', 'luka@example.com', 'processing', '2026-10-31', '["Farmerke Ravne", "Patike Grad"]')
on conflict (order_number) do update
  set email = excluded.email,
      status = excluded.status,
      eta = excluded.eta,
      items = excluded.items;

-- ---------------------------------------------------------------------------------------
-- record_bot_reply: adds the `flow` outcome (a guided-flow step or an action result).
-- It is neither an answer nor an "I don't know": the unknown streak starts over.
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
  if p_outcome not in ('answered', 'unknown', 'degraded', 'flow') then
    raise exception 'invalid outcome %', p_outcome using errcode = '22023';
  end if;

  update public.conversations c
     set unknown_streak = case p_outcome
                            when 'unknown' then c.unknown_streak + 1
                            when 'degraded' then c.unknown_streak
                            else 0
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

-- ---------------------------------------------------------------------------------------
-- claim_outbox: takes up to p_limit due async events for delivery. Each claimed row gets a
-- lease (next_attempt_at moves forward) and one more attempt, so two concurrent workers
-- (the cron tick and an after-response flush) never send the same row at the same time,
-- and a worker that dies mid-send leaves the row to be retried after the lease.
-- ---------------------------------------------------------------------------------------
create or replace function public.claim_outbox(p_limit integer, p_lease_seconds integer)
returns setof public.n8n_outbox
language sql
security definer
set search_path = ''
as $$
  update public.n8n_outbox o
     set attempts = o.attempts + 1,
         next_attempt_at = now() + make_interval(secs => greatest(p_lease_seconds, 10))
   where o.id in (
     select d.id
       from public.n8n_outbox d
      where d.status = 'pending'
        and d.next_attempt_at <= now()
        and d.type in ('escalation', 'reply_email')
      order by d.next_attempt_at
      limit least(greatest(p_limit, 1), 50)
      for update skip locked
   )
  returning o.*;
$$;

-- ---------------------------------------------------------------------------------------
-- apply_n8n_callback: n8n reports how an async event went (signature already verified by
-- the app). Unknown events change nothing; a replayed eventId is acknowledged with no effect.
-- Returns {result: applied | replayed | unknown_event}.
-- ---------------------------------------------------------------------------------------
create or replace function public.apply_n8n_callback(
  p_event_id uuid,
  p_status text,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'invalid status %', p_status using errcode = '22023';
  end if;

  perform 1
    from public.n8n_outbox o
   where o.event_id = p_event_id
     and o.type in ('escalation', 'reply_email')
     and o.status <> 'simulated';
  if not found then
    return jsonb_build_object('result', 'unknown_event');
  end if;

  insert into public.seen_event_ids (event_id) values (p_event_id::text)
  on conflict (event_id) do nothing;
  if not found then
    return jsonb_build_object('result', 'replayed');
  end if;

  update public.n8n_outbox
     set status = p_status,
         last_error = case when p_status = 'failed'
                           then left(coalesce(nullif(btrim(p_error), ''), 'failed'), 500)
                           else null end,
         delivered_at = coalesce(delivered_at, now())
   where event_id = p_event_id;

  return jsonb_build_object('result', 'applied');
end;
$$;

-- ---------------------------------------------------------------------------------------
-- digest_stats: weekly numbers for owners who opted in (`weekly_digest`), for n8n's digest
-- workflow (GET /api/n8n/digest). Sandbox owners are never emailed.
-- ---------------------------------------------------------------------------------------
create or replace function public.digest_stats(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(o order by o ->> 'notificationEmail'), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'notificationEmail', p.notification_email,
               'language', p.ui_language,
               'displayName', p.display_name,
               'conversations', coalesce(s.conversations, 0),
               'resolvedByBot', coalesce(s.resolved_by_bot, 0),
               'handedOff', coalesce(s.handed_off, 0),
               'avgFirstResponseMs', s.avg_first_response_ms,
               'thumbsUpShare', s.thumbs_up_share,
               'topUnknownQuestions', coalesce(u.questions, '[]'::jsonb)
             ) as o
        from public.profiles p
        left join lateral (
          select count(*)::int as conversations,
                 (count(*) filter (where c.handed_off_at is null))::int as resolved_by_bot,
                 (count(*) filter (where c.handed_off_at is not null))::int as handed_off,
                 round(avg(c.first_response_ms))::int as avg_first_response_ms,
                 round(
                   (count(*) filter (where c.rating = 'up'))::numeric
                   / nullif(count(*) filter (where c.rating is not null), 0),
                   2
                 ) as thumbs_up_share
            from public.conversations c
            join public.bots b on b.id = c.bot_id
           where b.owner_id = p.id
             and c.created_at >= p_since
        ) s on true
        left join lateral (
          select jsonb_agg(jsonb_build_object('question', q.question, 'count', q.n)
                           order by q.n desc, q.question) as questions
            from (
              select min(uq.question) as question, count(*)::int as n
                from public.unknown_questions uq
                join public.bots b on b.id = uq.bot_id
               where b.owner_id = p.id
                 and uq.created_at >= p_since
                 and uq.status = 'open'
               group by lower(btrim(uq.question))
               order by count(*) desc, min(uq.question)
               limit 5
            ) q
        ) u on true
       where p.weekly_digest
         and not p.is_sandbox
         and p.notification_email is not null
    ) owners;
$$;

-- ---------------------------------------------------------------------------------------
-- purge_expired_data: also drops finished outbox rows after 30 days (they carry visitor
-- emails and reply texts; spec §5.10).
-- ---------------------------------------------------------------------------------------
create or replace function public.purge_expired_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sandboxes integer;
  v_conversations integer;
  v_rate_limits integer;
  v_seen_events integer;
  v_outbox integer;
begin
  delete from auth.users u
   using public.profiles p
   where p.id = u.id
     and p.is_sandbox
     and p.sandbox_expires_at < now();
  get diagnostics v_sandboxes = row_count;

  delete from public.conversations c
   using public.bots b
   join public.profiles p on p.id = b.owner_id
   where c.bot_id = b.id
     and (b.is_demo or p.is_sandbox)
     and c.created_at < now() - interval '30 days';
  get diagnostics v_conversations = row_count;

  delete from public.rate_limits where window_start < now() - interval '2 days';
  get diagnostics v_rate_limits = row_count;

  -- Signed callbacks older than 5 minutes are rejected anyway; keep a generous margin.
  delete from public.seen_event_ids where seen_at < now() - interval '1 day';
  get diagnostics v_seen_events = row_count;

  delete from public.n8n_outbox
   where status in ('sent', 'failed', 'simulated', 'delivered')
     and created_at < now() - interval '30 days';
  get diagnostics v_outbox = row_count;

  return jsonb_build_object(
    'sandboxes', v_sandboxes,
    'conversations', v_conversations,
    'rate_limits', v_rate_limits,
    'seen_event_ids', v_seen_events,
    'outbox', v_outbox
  );
end;
$$;

revoke all on function public.claim_outbox(integer, integer) from public, anon, authenticated;
revoke all on function public.apply_n8n_callback(uuid, text, text) from public, anon, authenticated;
revoke all on function public.digest_stats(timestamptz) from public, anon, authenticated;
revoke all on function public.purge_expired_data() from public, anon, authenticated;

grant execute on function public.claim_outbox(integer, integer) to service_role;
grant execute on function public.apply_n8n_callback(uuid, text, text) to service_role;
grant execute on function public.digest_stats(timestamptz) to service_role;
grant execute on function public.purge_expired_data() to service_role;

-- The Event log lists an owner's newest events first (index exists: owner_id, created_at).
-- The action settings page lists a bot's newest runs (index exists: bot_id, created_at).
