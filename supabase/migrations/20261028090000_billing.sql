-- Phase 11: billing (spec §4.9, §5.2, §5.9). Stripe webhooks are the single source of truth
-- for the plan; these functions are the only writers of the plan and Stripe columns.

-- Shown as "ends on <date>" after the owner cancels in the Stripe portal. Server-only like
-- the other Stripe columns: `authenticated` has no UPDATE grant on it.
alter table public.profiles
  add column subscription_cancel_at_period_end boolean not null default false;

-- ---------------------------------------------------------------------------------------
-- The plan a subscription status pays for. `past_due` keeps Pro while Stripe retries the
-- card; anything ended, unpaid or never completed is Free.
-- ---------------------------------------------------------------------------------------
create or replace function public.plan_for_subscription_status(p_status text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when p_status in ('active', 'trialing', 'past_due') then 'pro' else 'free' end;
$$;

-- ---------------------------------------------------------------------------------------
-- Stores the owner's Stripe customer id once. A second customer created by a parallel
-- request loses: the stored id is returned and the caller uses that one.
-- ---------------------------------------------------------------------------------------
create or replace function public.link_stripe_customer(p_profile_id uuid, p_customer_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer text;
begin
  update public.profiles
     set stripe_customer_id = p_customer_id
   where id = p_profile_id
     and stripe_customer_id is null;

  select stripe_customer_id into v_customer from public.profiles where id = p_profile_id;
  return v_customer;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- apply_stripe_subscription: one webhook event, applied once.
-- The caller passes the subscription's CURRENT state (fetched from Stripe), so events that
-- arrive late or out of order can't roll the plan back. Records the event id first; a
-- duplicate returns {status: duplicate} and changes nothing. The event and the plan change
-- commit together.
-- An event about an older subscription never downgrades an owner who has a newer, paying
-- one (e.g. a cancelled first subscription after a re-subscribe).
-- Returns {status: applied | duplicate | unknown_customer | stale_subscription, plan?}.
-- ---------------------------------------------------------------------------------------
create or replace function public.apply_stripe_subscription(
  p_event_id text,
  p_event_type text,
  p_customer_id text,
  p_subscription_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_plan text := public.plan_for_subscription_status(p_status);
begin
  insert into public.stripe_events (stripe_event_id, type, processed_at)
  values (p_event_id, p_event_type, now())
  on conflict (stripe_event_id) do nothing;
  if not found then
    return jsonb_build_object('status', 'duplicate');
  end if;

  select * into v_profile
    from public.profiles
   where stripe_customer_id = p_customer_id
   for update;

  -- Checkout names the profile (client_reference_id); link it if it has no customer yet.
  if not found and p_profile_id is not null then
    select * into v_profile
      from public.profiles
     where id = p_profile_id
       and stripe_customer_id is null
     for update;
  end if;

  if not found then
    return jsonb_build_object('status', 'unknown_customer');
  end if;

  if v_profile.stripe_subscription_id is not null
     and v_profile.stripe_subscription_id <> p_subscription_id
     and public.plan_for_subscription_status(v_profile.subscription_status) = 'pro'
     and v_plan = 'free' then
    return jsonb_build_object('status', 'stale_subscription');
  end if;

  update public.profiles
     set stripe_customer_id = p_customer_id,
         stripe_subscription_id = p_subscription_id,
         subscription_status = p_status,
         current_period_end = p_current_period_end,
         subscription_cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
         plan = v_plan
   where id = v_profile.id;

  return jsonb_build_object('status', 'applied', 'plan', v_plan);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- The signed-in owner's usage this month (UTC, the same period `start_conversation` counts),
-- with the limits of their plan. One call for the billing page and the limit banners.
-- ---------------------------------------------------------------------------------------
create or replace function public.my_usage()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'plan', p.plan,
    'period', to_char(now() at time zone 'utc', 'YYYY-MM'),
    'conversations', coalesce((
      select u.conversations_started
        from public.usage_counters u
       where u.profile_id = p.id
         and u.period = to_char(now() at time zone 'utc', 'YYYY-MM')
    ), 0),
    'conversationLimit', public.plan_conversation_limit(p.plan),
    'bots', (select count(*) from public.bots b where b.owner_id = p.id),
    'botLimit', public.plan_bot_limit(p.plan)
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke all on function public.plan_for_subscription_status(text) from public, anon;
revoke all on function public.link_stripe_customer(uuid, text) from public, anon, authenticated;
revoke all on function public.apply_stripe_subscription(text, text, text, text, text, timestamptz, boolean, uuid)
  from public, anon, authenticated;
revoke all on function public.my_usage() from public, anon;

grant execute on function public.plan_for_subscription_status(text) to authenticated, service_role;
grant execute on function public.link_stripe_customer(uuid, text) to service_role;
grant execute on function public.apply_stripe_subscription(text, text, text, text, text, timestamptz, boolean, uuid)
  to service_role;
grant execute on function public.my_usage() to authenticated;
