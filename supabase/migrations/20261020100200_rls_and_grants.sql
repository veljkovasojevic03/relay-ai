-- Phase 1 / 3 of 5: row level security and column-level grants (spec §5.1, §5.2, §6).
--
-- Model: `anon` gets nothing (the widget API runs on the server with the service role and
-- scopes every query itself). `authenticated` = a shop owner, who sees only rows of their
-- own bots and may write only the columns the dashboard edits. Plan, billing, sandbox,
-- embedding and counter columns are writable by the service role only.

alter table public.profiles enable row level security;
alter table public.bots enable row level security;
alter table public.faqs enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.unknown_questions enable row level security;
alter table public.actions enable row level security;
alter table public.bot_actions enable row level security;
alter table public.action_runs enable row level security;
alter table public.tickets enable row level security;
alter table public.demo_orders enable row level security;
alter table public.n8n_outbox enable row level security;
alter table public.usage_counters enable row level security;
alter table public.stripe_events enable row level security;
alter table public.rate_limits enable row level security;
alter table public.seen_event_ids enable row level security;

-- Start from zero, then grant explicitly.
revoke all on all tables in schema public from anon, authenticated;

-- True when the current user owns the bot. `(select auth.uid())` is evaluated once per
-- statement instead of once per row.
create or replace function private.owns_bot(p_bot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bots b where b.id = p_bot_id and b.owner_id = (select auth.uid())
  );
$$;

revoke all on function private.owns_bot(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.owns_bot(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- profiles: read own row; update only the profile fields.
-- ---------------------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (display_name, ui_language, notification_email, weekly_digest)
  on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------
-- bots: full CRUD on own bots, minus `owner_id`, `public_key` and `is_demo`.
-- ---------------------------------------------------------------------------------------
grant select, delete on public.bots to authenticated;
grant insert (name, description, default_language, brand_color, logo_path, greeting, position,
              allowed_origins, active, featured_questions)
  on public.bots to authenticated;
grant update (name, description, default_language, brand_color, logo_path, greeting, position,
              allowed_origins, active, featured_questions)
  on public.bots to authenticated;

create policy bots_select_own on public.bots
  for select to authenticated using (owner_id = (select auth.uid()));
create policy bots_insert_own on public.bots
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy bots_update_own on public.bots
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy bots_delete_own on public.bots
  for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------
-- faqs: CRUD on FAQs of own bots; embedding columns are server-only.
-- ---------------------------------------------------------------------------------------
grant select, delete on public.faqs to authenticated;
grant insert (bot_id, question, answer, language, featured) on public.faqs to authenticated;
grant update (question, answer, language, featured) on public.faqs to authenticated;

create policy faqs_select_own on public.faqs
  for select to authenticated using (private.owns_bot(bot_id));
create policy faqs_insert_own on public.faqs
  for insert to authenticated with check (private.owns_bot(bot_id));
create policy faqs_update_own on public.faqs
  for update to authenticated using (private.owns_bot(bot_id)) with check (private.owns_bot(bot_id));
create policy faqs_delete_own on public.faqs
  for delete to authenticated using (private.owns_bot(bot_id));

-- ---------------------------------------------------------------------------------------
-- conversations & messages: created by the widget API (service role). Owners read them,
-- change the inbox fields, and may delete a conversation (spec §5.10).
-- ---------------------------------------------------------------------------------------
grant select, delete on public.conversations to authenticated;
grant update (status, owner_unread, resolved_by) on public.conversations to authenticated;

create policy conversations_select_own on public.conversations
  for select to authenticated using (private.owns_bot(bot_id));
create policy conversations_update_own on public.conversations
  for update to authenticated using (private.owns_bot(bot_id)) with check (private.owns_bot(bot_id));
create policy conversations_delete_own on public.conversations
  for delete to authenticated using (private.owns_bot(bot_id));

grant select on public.messages to authenticated;
create policy messages_select_own on public.messages
  for select to authenticated using (private.owns_bot(bot_id));

-- ---------------------------------------------------------------------------------------
-- unknown questions, tickets, action runs, bot action toggles
-- ---------------------------------------------------------------------------------------
grant select on public.unknown_questions to authenticated;
grant update (status) on public.unknown_questions to authenticated;
create policy unknown_questions_select_own on public.unknown_questions
  for select to authenticated using (private.owns_bot(bot_id));
create policy unknown_questions_update_own on public.unknown_questions
  for update to authenticated using (private.owns_bot(bot_id)) with check (private.owns_bot(bot_id));

grant select on public.tickets to authenticated;
grant update (status) on public.tickets to authenticated;
create policy tickets_select_own on public.tickets
  for select to authenticated using (private.owns_bot(bot_id));
create policy tickets_update_own on public.tickets
  for update to authenticated using (private.owns_bot(bot_id)) with check (private.owns_bot(bot_id));

grant select on public.action_runs to authenticated;
create policy action_runs_select_own on public.action_runs
  for select to authenticated using (private.owns_bot(bot_id));

-- The registry itself is global and read-only for owners.
grant select on public.actions to authenticated;
create policy actions_select_all on public.actions for select to authenticated using (true);

grant select, delete on public.bot_actions to authenticated;
grant insert (bot_id, action_id, enabled) on public.bot_actions to authenticated;
grant update (enabled) on public.bot_actions to authenticated;
create policy bot_actions_select_own on public.bot_actions
  for select to authenticated using (private.owns_bot(bot_id));
create policy bot_actions_insert_own on public.bot_actions
  for insert to authenticated with check (private.owns_bot(bot_id));
create policy bot_actions_update_own on public.bot_actions
  for update to authenticated using (private.owns_bot(bot_id)) with check (private.owns_bot(bot_id));
create policy bot_actions_delete_own on public.bot_actions
  for delete to authenticated using (private.owns_bot(bot_id));

-- ---------------------------------------------------------------------------------------
-- Read-only views of the owner's own usage and integration events.
-- ---------------------------------------------------------------------------------------
grant select on public.usage_counters to authenticated;
create policy usage_counters_select_own on public.usage_counters
  for select to authenticated using (profile_id = (select auth.uid()));

grant select on public.n8n_outbox to authenticated;
create policy n8n_outbox_select_own on public.n8n_outbox
  for select to authenticated using (owner_id = (select auth.uid()));

-- demo_orders, stripe_events, rate_limits, seen_event_ids: RLS on, no policies, no grants.
-- Only the service role (which bypasses RLS) can touch them.
