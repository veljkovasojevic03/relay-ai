-- Phase 8: analytics and unknown-question suggestions (spec §4.8).

-- ---------------------------------------------------------------------------------------
-- analytics_summary: totals and a per-day series for one bot (or all of the caller's bots
-- when p_bot_id is null) over the last p_days days, UTC. SECURITY INVOKER: RLS on
-- `conversations` limits it to the signed-in owner's bots, so it can't leak other tenants.
--
--   resolvedByBot = conversations never handed to a person; handedOff = the others.
-- ---------------------------------------------------------------------------------------
create or replace function public.analytics_summary(p_bot_id uuid default null, p_days integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select greatest(1, least(coalesce(p_days, 30), 366)) as days,
           (now() at time zone 'utc')::date as today
  ),
  bounds as (
    select days, today, today - (days - 1) as first_day from params
  ),
  scoped as (
    select c.created_at, c.handed_off_at, c.first_response_ms, c.rating
      from public.conversations c, bounds b
     where (p_bot_id is null or c.bot_id = p_bot_id)
       and c.created_at >= (b.first_day::timestamp at time zone 'utc')
  ),
  days as (
    select generate_series(b.first_day, b.today, interval '1 day')::date as day from bounds b
  ),
  daily as (
    select d.day,
           (count(s.created_at) filter (where s.handed_off_at is null))::int as by_bot,
           (count(s.created_at) filter (where s.handed_off_at is not null))::int as handed_off
      from days d
      left join scoped s on (s.created_at at time zone 'utc')::date = d.day
     group by d.day
  )
  select jsonb_build_object(
    'days', (select days from bounds),
    'totals', (
      select jsonb_build_object(
        'conversations', count(*)::int,
        'resolvedByBot', (count(*) filter (where handed_off_at is null))::int,
        'handedOff', (count(*) filter (where handed_off_at is not null))::int,
        'avgFirstResponseMs', round(avg(first_response_ms))::int,
        'ratingsUp', (count(*) filter (where rating = 'up'))::int,
        'ratingsDown', (count(*) filter (where rating = 'down'))::int
      )
      from scoped
    ),
    'daily', (
      select jsonb_agg(
        jsonb_build_object('day', day, 'byBot', by_bot, 'handedOff', handed_off) order by day
      )
      from daily
    )
  );
$$;

revoke all on function public.analytics_summary(uuid, integer) from public, anon;
grant execute on function public.analytics_summary(uuid, integer) to authenticated, service_role;

-- The analytics query filters conversations by bot and creation time.
create index if not exists conversations_bot_created_idx
  on public.conversations (bot_id, created_at desc);

-- ---------------------------------------------------------------------------------------
-- The first human reply in a conversation becomes the suggested FAQ answer for that
-- conversation's open unknown questions (spec §4.8: "the human's reply as the draft").
-- Later replies don't overwrite it; a question the owner already handled is left alone.
-- ---------------------------------------------------------------------------------------
create or replace function private.suggest_from_human_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.unknown_questions
     set suggested_answer = left(new.content, 4000),
         suggestion_source = 'human_reply'
   where conversation_id = new.conversation_id
     and bot_id = new.bot_id
     and status = 'open'
     and suggestion_source = 'none'
     and created_at <= new.created_at;
  return new;
end;
$$;
revoke all on function private.suggest_from_human_reply() from public;

create trigger messages_suggest_from_human_reply after insert on public.messages
  for each row when (new.role = 'human')
  execute function private.suggest_from_human_reply();

-- Backfill: open questions whose conversation already has a human reply after them.
update public.unknown_questions uq
   set suggested_answer = first_reply.content,
       suggestion_source = 'human_reply'
  from (
    select distinct on (q.id) q.id, left(m.content, 4000) as content
      from public.unknown_questions q
      join public.messages m
        on m.conversation_id = q.conversation_id
       and m.role = 'human'
       and m.created_at >= q.created_at
     where q.status = 'open'
       and q.suggestion_source = 'none'
     order by q.id, m.created_at
  ) first_reply
 where uq.id = first_reply.id;
