-- Phase 1 / 2 of 5: tables (spec §6). Every foreign key and hot path is indexed.
-- Child rows carry `bot_id` next to `conversation_id` with a composite foreign key, so RLS
-- policies stay one join away from the owner and a row can never point at a conversation of
-- a different bot.

-- Loose shape check only. Real validation happens in the app (zod) before insert.
create domain public.email_address as text
  check (value is null or (char_length(value) <= 254 and value ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'));

-- ---------------------------------------------------------------------------------------
-- Owners
-- ---------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  display_name text check (char_length(display_name) <= 80),
  ui_language text not null default 'en' check (ui_language in ('en', 'sr')),
  notification_email public.email_address,
  weekly_digest boolean not null default false,
  -- Server-only columns (see grants): written by the Stripe webhook / sandbox flow only.
  plan text not null default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text,
  current_period_end timestamptz,
  is_sandbox boolean not null default false,
  sandbox_expires_at timestamptz,
  check (not is_sandbox or sandbox_expires_at is not null)
);

create index profiles_sandbox_expiry_idx on public.profiles (sandbox_expires_at) where is_sandbox;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- Bots
-- ---------------------------------------------------------------------------------------
create table public.bots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Public, URL-safe identifier used in the embed snippet (24 chars, 144 random bits).
  public_key text not null unique
    default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')
    check (public_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  default_language text not null default 'en' check (default_language in ('en', 'sr')),
  brand_color text not null default '#b3472b' check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_path text check (char_length(logo_path) <= 300),
  greeting jsonb not null
    default '{"en": "Hi! How can I help you today?", "sr": "Zdravo! Kako mogu da pomognem?"}'
    check (jsonb_typeof(greeting) = 'object'),
  position text not null default 'right' check (position in ('left', 'right')),
  allowed_origins text[] not null default '{}'
    check (cardinality(allowed_origins) <= 20 and public.is_valid_origin_list(allowed_origins)),
  active boolean not null default true,
  featured_questions jsonb not null default '[]'
    check (jsonb_typeof(featured_questions) = 'array' and jsonb_array_length(featured_questions) <= 6),
  is_demo boolean not null default false
);

create index bots_owner_id_idx on public.bots (owner_id);

create trigger bots_set_updated_at before update on public.bots
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- Knowledge
-- ---------------------------------------------------------------------------------------
create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 500),
  answer text not null check (char_length(btrim(answer)) between 1 and 4000),
  language text not null default 'en' check (language in ('en', 'sr')),
  featured boolean not null default false,
  embedding extensions.vector(384),
  embedding_status text not null default 'pending'
    check (embedding_status in ('pending', 'ready', 'failed')),
  fts tsvector generated always as (to_tsvector('simple', question || ' ' || answer)) stored,
  check (embedding_status <> 'ready' or embedding is not null)
);

create index faqs_bot_id_idx on public.faqs (bot_id);
create index faqs_embedding_hnsw_idx on public.faqs
  using hnsw (embedding extensions.vector_cosine_ops);
create index faqs_fts_idx on public.faqs using gin (fts);

create trigger faqs_set_updated_at before update on public.faqs
  for each row execute function private.set_updated_at();

-- Editing the text invalidates the embedding; the embed function recomputes it.
create or replace function private.faqs_reset_embedding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.question is distinct from old.question
     or new.answer is distinct from old.answer
     or new.language is distinct from old.language then
    new.embedding := null;
    new.embedding_status := 'pending';
  end if;
  return new;
end;
$$;

create trigger faqs_reset_embedding before update on public.faqs
  for each row execute function private.faqs_reset_embedding();

-- ---------------------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  -- SHA-256 (hex) of the visitor's 128-bit bearer token. The token itself is never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Separate random value for the Realtime Broadcast channel (never derived from the token).
  realtime_channel text not null unique check (char_length(realtime_channel) >= 32),
  status text not null default 'bot'
    check (status in ('bot', 'waiting_human', 'human', 'resolved')),
  language text not null default 'en' check (language in ('en', 'sr')),
  visitor_email public.email_address,
  ip_hash text check (char_length(ip_hash) <= 128),
  visitor_message_count integer not null default 0 check (visitor_message_count >= 0),
  unknown_streak integer not null default 0 check (unknown_streak >= 0),
  rating text check (rating in ('up', 'down')),
  first_response_ms integer check (first_response_ms >= 0),
  handed_off_at timestamptz,
  last_visitor_activity_at timestamptz not null default now(),
  resolved_by text check (resolved_by in ('bot', 'human', 'visitor')),
  owner_unread boolean not null default false,
  mode text not null default 'sample' check (mode in ('sample', 'live')),
  unique (id, bot_id)
);

create index conversations_bot_created_idx on public.conversations (bot_id, created_at desc);
create index conversations_bot_status_idx on public.conversations (bot_id, status);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id uuid not null,
  bot_id uuid not null,
  role text not null check (role in ('visitor', 'bot', 'human', 'system')),
  content text not null check (char_length(content) between 1 and 8000),
  source_faq_ids uuid[] not null default '{}',
  meta jsonb not null default '{}' check (jsonb_typeof(meta) = 'object'),
  foreign key (conversation_id, bot_id)
    references public.conversations (id, bot_id) on delete cascade
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index messages_bot_id_idx on public.messages (bot_id);

create table public.unknown_questions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  conversation_id uuid,
  question text not null check (char_length(question) between 1 and 500),
  language text not null default 'en' check (language in ('en', 'sr')),
  status text not null default 'open' check (status in ('open', 'added', 'dismissed')),
  suggested_answer text check (char_length(suggested_answer) <= 4000),
  suggestion_source text not null default 'none'
    check (suggestion_source in ('human_reply', 'ai', 'none')),
  -- Deleting a conversation deletes what was derived from it (privacy, spec §5.10).
  foreign key (conversation_id, bot_id)
    references public.conversations (id, bot_id) on delete cascade
);

create index unknown_questions_bot_status_idx on public.unknown_questions (bot_id, status, created_at desc);
create index unknown_questions_conversation_idx on public.unknown_questions (conversation_id);

-- ---------------------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------------------
create table public.actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null unique check (name ~ '^[a-z][a-z0-9_]{1,40}$'),
  description text not null,
  params_schema jsonb not null check (jsonb_typeof(params_schema) = 'object'),
  requires_confirmation boolean not null default true,
  n8n_path text not null check (n8n_path ~ '^[a-z0-9-]{1,80}$')
);

create table public.bot_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  action_id uuid not null references public.actions (id) on delete cascade,
  enabled boolean not null default false,
  unique (bot_id, action_id)
);

create index bot_actions_action_id_idx on public.bot_actions (action_id);

create table public.action_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  conversation_id uuid not null,
  bot_id uuid not null,
  action_name text not null references public.actions (name) on update cascade,
  -- PII-minimal: the app stores only what the action needs.
  params jsonb not null default '{}' check (jsonb_typeof(params) = 'object'),
  status text not null default 'pending_confirmation' check (status in (
    'pending_confirmation', 'confirmed', 'running', 'succeeded', 'failed', 'cancelled'
  )),
  result jsonb,
  error text check (char_length(error) <= 500),
  simulated boolean not null default false,
  duration_ms integer check (duration_ms >= 0),
  foreign key (conversation_id, bot_id)
    references public.conversations (id, bot_id) on delete cascade
);

create index action_runs_conversation_idx on public.action_runs (conversation_id, created_at);
create index action_runs_bot_created_idx on public.action_runs (bot_id, created_at desc);
create index action_runs_action_name_idx on public.action_runs (action_name);

create trigger action_runs_set_updated_at before update on public.action_runs
  for each row execute function private.set_updated_at();

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  conversation_id uuid,
  subject text not null check (char_length(subject) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  visitor_email public.email_address,
  reference text unique check (char_length(reference) <= 40),
  status text not null default 'open' check (status in ('open', 'closed')),
  -- A ticket is the owner's business record: it outlives the conversation.
  foreign key (conversation_id, bot_id)
    references public.conversations (id, bot_id) on delete set null (conversation_id)
);

create index tickets_bot_created_idx on public.tickets (bot_id, created_at desc);
create index tickets_conversation_idx on public.tickets (conversation_id);

create trigger tickets_set_updated_at before update on public.tickets
  for each row execute function private.set_updated_at();

-- Seeded data for the demo bot's `order_status` action. Never exposed to API roles.
create table public.demo_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_number text not null unique check (char_length(order_number) between 1 and 32),
  email public.email_address not null,
  status text not null check (status in ('processing', 'shipped', 'delivered', 'cancelled')),
  eta date,
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array')
);

-- ---------------------------------------------------------------------------------------
-- Integrations, billing, abuse control
-- ---------------------------------------------------------------------------------------
create table public.n8n_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id uuid not null unique default gen_random_uuid(),
  -- Lets the owner's Event log page list their own events through RLS.
  owner_id uuid references public.profiles (id) on delete cascade,
  type text not null check (type in (
    'escalation', 'reply_email', 'action.order_status', 'action.create_ticket'
  )),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'simulated')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (char_length(last_error) <= 500),
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index n8n_outbox_due_idx on public.n8n_outbox (next_attempt_at) where status = 'pending';
create index n8n_outbox_owner_created_idx on public.n8n_outbox (owner_id, created_at desc);

create table public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  conversations_started integer not null default 0 check (conversations_started >= 0),
  unique (profile_id, period)
);

create table public.stripe_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  stripe_event_id text not null unique,
  type text not null,
  processed_at timestamptz
);

create table public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  key text not null check (char_length(key) between 1 and 200),
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  unique (key, window_start)
);

create index rate_limits_window_start_idx on public.rate_limits (window_start);

create table public.seen_event_ids (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id text not null unique check (char_length(event_id) between 1 and 100),
  seen_at timestamptz not null default now()
);

create index seen_event_ids_seen_at_idx on public.seen_event_ids (seen_at);

-- ---------------------------------------------------------------------------------------
-- Profile bootstrap
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
begin
  insert into public.profiles (id, display_name, notification_email, ui_language)
  values (
    new.id,
    v_name,
    new.email,
    case when v_language in ('en', 'sr') then v_language else 'en' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
