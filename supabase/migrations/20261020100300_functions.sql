-- Phase 1 / 4 of 5: SQL functions (spec §6). All pin `search_path` and qualify every name.

-- Monthly conversation quota per plan (spec §4.9).
create or replace function public.plan_conversation_limit(p_plan text)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_plan when 'pro' then 1000 else 50 end;
$$;

-- ---------------------------------------------------------------------------------------
-- start_conversation: the only way a conversation is created. Checks and increments the
-- owner's monthly counter in one statement (the ON CONFLICT row lock serializes concurrent
-- callers), then inserts the conversation in the same transaction. Any failure rolls back
-- the increment too.
-- Returns {status: ok, conversation_id, realtime_channel}
--      or {status: bot_not_found | bot_inactive | quota_exceeded}.
-- ---------------------------------------------------------------------------------------
create or replace function public.start_conversation(
  p_bot_id uuid,
  p_token_hash text,
  p_language text,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_plan text;
  v_active boolean;
  v_count integer;
  v_id uuid;
  v_channel text := encode(extensions.gen_random_bytes(16), 'hex');
  v_period text := to_char(now() at time zone 'utc', 'YYYY-MM');
begin
  select b.owner_id, b.active, p.plan
    into v_owner, v_active, v_plan
    from public.bots b
    join public.profiles p on p.id = b.owner_id
   where b.id = p_bot_id;

  if not found then
    return jsonb_build_object('status', 'bot_not_found');
  end if;
  if not v_active then
    return jsonb_build_object('status', 'bot_inactive');
  end if;

  insert into public.usage_counters as u (profile_id, period, conversations_started)
  values (v_owner, v_period, 1)
  on conflict (profile_id, period) do update
    set conversations_started = u.conversations_started + 1
    where u.conversations_started < public.plan_conversation_limit(v_plan)
  returning u.conversations_started into v_count;

  if v_count is null then
    return jsonb_build_object('status', 'quota_exceeded');
  end if;

  insert into public.conversations (bot_id, token_hash, realtime_channel, language, ip_hash)
  values (
    p_bot_id,
    p_token_hash,
    v_channel,
    case when p_language in ('en', 'sr') then p_language else 'en' end,
    p_ip_hash
  )
  returning id into v_id;

  return jsonb_build_object('status', 'ok', 'conversation_id', v_id, 'realtime_channel', v_channel);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- check_rate_limit: fixed-window counter, one atomic upsert per call.
-- Returns true while the caller is within `p_limit` hits for the current window.
-- ---------------------------------------------------------------------------------------
create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'check_rate_limit: limit and window must be positive';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  return v_count <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- match_faqs: retrieval over one bot's FAQs.
-- Vector: cosine similarity on `embedding` (HNSW). Hybrid: reciprocal-rank fusion
-- (k = 60) of the vector ranking with a Postgres full-text ranking ('simple' config, any
-- query word may match).
--
-- SECURITY INVOKER on purpose (a deliberate deviation from the spec's DEFINER list): the
-- dashboard playground calls it as the owner, so RLS limits it to the owner's own bots.
-- The widget API calls it with the service role and passes the bot it resolved from the
-- public key.
--
-- `hnsw.iterative_scan` keeps scanning the index until enough rows survive the bot_id
-- filter. Without it, a large tenant's FAQs could crowd a small tenant's out of the
-- candidate set and return nothing.
-- ---------------------------------------------------------------------------------------
create or replace function public.match_faqs(
  p_bot_id uuid,
  p_query_embedding extensions.vector(384),
  p_query_text text,
  p_k integer default 5,
  p_hybrid boolean default false
)
returns table (
  id uuid,
  question text,
  answer text,
  language text,
  featured boolean,
  similarity double precision,
  vector_rank integer,
  text_rank integer,
  rrf_score double precision
)
language sql
stable
security invoker
set search_path = ''
set hnsw.iterative_scan = 'relaxed_order'
as $$
  with params as (
    select
      least(greatest(coalesce(p_k, 5), 1), 50) as k,
      to_tsvector('simple', coalesce(p_query_text, '')) as query_vector
  ),
  text_query as (
    -- OR of the query's words, built from parsed lexemes so user input is never parsed
    -- as tsquery syntax.
    select case
      when length(params.query_vector) = 0 then null
      else to_tsquery('simple', array_to_string(
        array(select quote_literal(w) from unnest(tsvector_to_array(params.query_vector)) as w),
        ' | '
      ))
    end as q
    from params
  ),
  vector_hits as (
    select f.id,
           f.embedding operator(extensions.<=>) p_query_embedding as distance
      from public.faqs f
     where f.bot_id = p_bot_id
       and f.embedding_status = 'ready'
       and p_query_embedding is not null
     order by f.embedding operator(extensions.<=>) p_query_embedding
     limit (select k * 4 from params)
  ),
  vector_ranked as (
    select vh.id, vh.distance, row_number() over (order by vh.distance)::integer as rnk
      from vector_hits vh
  ),
  text_ranked as (
    select f.id,
           row_number() over (order by ts_rank_cd(f.fts, tq.q) desc, f.id)::integer as rnk
      from public.faqs f, text_query tq
     where p_hybrid
       and tq.q is not null
       and f.bot_id = p_bot_id
       and f.fts @@ tq.q
     order by ts_rank_cd(f.fts, tq.q) desc, f.id
     limit (select k * 4 from params)
  ),
  fused as (
    select coalesce(v.id, t.id) as id,
           v.distance,
           v.rnk as vector_rank,
           t.rnk as text_rank,
           coalesce(1.0 / (60 + v.rnk), 0) + coalesce(1.0 / (60 + t.rnk), 0) as rrf_score
      from vector_ranked v
      full outer join text_ranked t on t.id = v.id
  )
  select f.id,
         f.question,
         f.answer,
         f.language,
         f.featured,
         case when fu.distance is null then null else (1 - fu.distance)::double precision end,
         fu.vector_rank,
         fu.text_rank,
         fu.rrf_score::double precision
    from fused fu
    join public.faqs f on f.id = fu.id
   order by case when p_hybrid then fu.rrf_score else 1 - fu.distance end desc nulls last,
            f.id
   limit (select k from params);
$$;

-- ---------------------------------------------------------------------------------------
-- purge_expired_data: called by the cron tick. Deletes expired sandbox accounts (cascades
-- to everything they own), demo/sandbox conversations older than 30 days, and stale
-- rate-limit / replay-protection rows. Returns counts for the tick's log line.
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

  return jsonb_build_object(
    'sandboxes', v_sandboxes,
    'conversations', v_conversations,
    'rate_limits', v_rate_limits,
    'seen_event_ids', v_seen_events
  );
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Execute grants. Server-side functions are callable by the service role only.
-- ---------------------------------------------------------------------------------------
revoke all on function public.plan_conversation_limit(text) from public, anon, authenticated;
revoke all on function public.start_conversation(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.purge_expired_data() from public, anon, authenticated;
revoke all on function public.match_faqs(uuid, extensions.vector, text, integer, boolean) from public, anon;

grant execute on function public.plan_conversation_limit(text) to authenticated, service_role;
grant execute on function public.start_conversation(uuid, text, text, text) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.purge_expired_data() to service_role;
grant execute on function public.match_faqs(uuid, extensions.vector, text, integer, boolean)
  to authenticated, service_role;

revoke all on function private.set_updated_at() from public;
revoke all on function private.faqs_reset_embedding() from public;
revoke all on function private.handle_new_user() from public;
