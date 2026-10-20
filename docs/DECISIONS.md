# Decisions

One line per decision: what + why. Newest at the bottom of each phase.

## Phase 0: Foundation

- **Next.js 16.4 with `cacheComponents` on** (create-next-app default). Dynamic route handlers opt out of prerendering with `await connection()`; this matches where Next is heading.
- **pnpm 12, Node 24** (`.nvmrc`, `engines`). Current LTS. pnpm 12 `allowBuilds` makes every install script an explicit choice: only `supabase` (CLI binary download) is allowed.
- **No pnpm workspace yet: the Next.js app stays at the repo root (`src/app`) instead of `app/`.** The spec allows a workspace "only if it stays simple". The widget gets its own esbuild build in Phase 5 without needing a second package manifest.
- **Repo layout:** `src/` (app), `widget/`, `supabase/` (config, migrations, functions), `n8n/`, `eval/`, `docs/`, `scripts/`, `e2e/`. Folders that a later phase fills hold a short README naming that phase, not fake code.
- **Env names follow spec §10 exactly.** `NEXT_PUBLIC_SUPABASE_ANON_KEY` also accepts Supabase's newer publishable key and `SUPABASE_SERVICE_ROLE_KEY` the newer secret key; both drop into the same slots.
- **All integrations are optional in the env schema**; features check `has*()` helpers and degrade (Sample mode, simulated n8n, billing off). This enforces the "graceful fallback, no fake stubs" rule.
- **`N8N_MODE` defaults to `simulated` unless `N8N_WEBHOOK_BASE` is set; `real` without base + secret fails at boot.** A misconfigured real mode should fail loudly, not silently simulate.
- **Live (`sk_live_`) Stripe keys are rejected at boot.** The $0 / Hobby-plan rule must be impossible to break by misconfiguration.
- **Env validation errors list variable names and rule messages, never values.** Avoids leaking secrets into logs.
- **Structured JSON logger with flat scalar fields only.** Makes it hard to accidentally log message bodies or objects containing PII.
- **Baseline security headers now (nosniff, referrer, `SAMEORIGIN`, permissions policy); strict dashboard CSP later**, once the third-party origins it must allow exist. `SAMEORIGIN` rather than `DENY` so the landing page can frame `/demo`.
- **`/api/health` calls `public.health_check()` (`select now()`) through the service-role client.** It is a real Postgres round-trip that touches no tables and is executable by `service_role` only. It returns 200 `degraded` when Supabase isn't configured (local/CI) and 503 only when a configured database fails.
- **Cron: GitHub Actions hourly at :17 → `POST /api/cron/tick` with `Authorization: Bearer CRON_SECRET`.** Hourly is far inside the 7-day pause window and leaves headroom for outbox retries later. Unauthorized → 401; no secret configured → 503 (never open). The workflow skips cleanly when repo secrets are missing.
- **Bearer secrets are compared via SHA-256 digests + `timingSafeEqual`.** Equal-length buffers mean no length or content timing leak.
- **i18n: next-intl with locale-prefix routing, `localePrefix: "as-needed"`** (English at `/`, Serbian at `/sr`). Prefix routing keeps pages statically prerenderable under Cache Components (cookie-based locale would make every page dynamic) and keeps `/demo` clean. The root layout is `src/app/[locale]/layout.tsx`, and locale comes from `next/root-params` as the next-intl docs recommend for Next ≥ 16.3.
- **English catalog is the typed reference** (`AppConfig.Messages`); a unit test enforces identical keys and no empty strings in `sr.json`.
- **Serbian copy uses the informal "ti"** to match the spec's "speak to ONE person" voice.
- **shadcn/ui on the Radix base (`new-york` style)**, wired to Relay tokens. Radix is the most battle-tested primitives layer for the accessibility bar. shadcn now ships the `cn` helper as its own package (`cn`, maintained by shadcn), which replaces clsx + tailwind-merge.
- **Single light theme for v1, no dark mode.** The spec's direction is explicitly light and warm, and a second theme doubles the contrast surface. The widget themes independently from `brand_color`.
- **Design tokens are hex values in `globals.css`, and a unit test parses them and checks WCAG AA pairs.** Contrast can't silently regress when someone tweaks a color.
- **Fonts: Fraunces (display, `SOFT`/`opsz` axes) + Instrument Sans (UI) via `next/font/google`, `latin-ext` subset.** Serbian Latin diacritics need it.
- **Supabase CLI as a devDependency (`pnpm exec supabase`)** so every machine and CI use the same pinned CLI version.
- **Default models `claude-haiku-4-5` (Free) / `claude-sonnet-5-5` (Pro)**, overridable via env. Re-verify against Anthropic docs in Phase 10.
- **E2E runs against `next start` (a production build)** so CI tests what Vercel serves.
- **`.gitattributes` forces LF.** The repo is developed on Windows and CI runs on Linux.
- **gitleaks runs from the pinned official image (`ghcr.io/gitleaks/gitleaks:v8.30.1`) over the full history**, not `gitleaks-action`. The action failed on the repo's first push (commit-range edge case) and targets deprecated Node 20, while a full scan of a small repo is cheap and has no edge cases.
- **Local development uses Docker Desktop (WSL2) for the local Supabase stack** (`supabase start`). Migrations and RLS tests run against a disposable local database first; the cloud project only receives `supabase db push`.

## Phase 1: Database, auth, RLS

- **Child tables carry `bot_id` next to `conversation_id` with a composite FK to `conversations (id, bot_id)`.** RLS stays one lookup away from the owner (`private.owns_bot`), and a message, action run or ticket can never point at another bot's conversation. `messages.bot_id` and `n8n_outbox.owner_id` are additions to the §6 contract for exactly this reason.
- **Policies call `private.owns_bot(bot_id)`, a `SECURITY DEFINER` helper in a schema PostgREST doesn't expose.** One indexed lookup, no RLS recursion through `bots`, and `(select auth.uid())` is evaluated once per statement.
- **Least privilege by default:** migrations revoke all table and function access from `anon`/`authenticated`, and future objects inherit that via `ALTER DEFAULT PRIVILEGES`. Every grant is explicit and column-scoped for writes. `anon` gets nothing: the widget API runs server-side with the service role.
- **Owners may read `conversations.token_hash` / `realtime_channel` (no column-level SELECT restriction).** They are the owner's own conversations, the hash is useless without the 128-bit token, and column-limited SELECT breaks `select *` and Realtime `postgres_changes` (Phase 6).
- **`start_conversation` enforces the quota with one `INSERT … ON CONFLICT DO UPDATE … WHERE count < limit`.** The conflict row lock serializes concurrent callers, so no read-then-write race. The conversation insert is in the same transaction, so a failure rolls the increment back. A test races 20 calls against 5 free slots.
- **`check_rate_limit` is a fixed window** (`floor(epoch / window)`), one atomic upsert per call. Simpler than a sliding window; the worst case of 2× burst at a window edge is acceptable for abuse control.
- **`match_faqs` is `SECURITY INVOKER` (a deviation from the spec's DEFINER list).** The dashboard playground calls it as the owner, so RLS confines it to their bots. The widget calls it with the service role and an explicit bot id.
- **`hnsw.iterative_scan = relaxed_order` on `match_faqs`** (pgvector 0.8). With one global HNSW index, post-filtering by `bot_id` could otherwise return too few rows for a small tenant.
- **Full-text query = OR of parsed lexemes, each `quote_literal`-ed**, so visitor text can never inject tsquery syntax. Diacritic-insensitive matching (`unaccent`) is deferred to Phase 3, where §12 says to measure it.
- **Deleting a conversation cascades to its messages, unknown questions and action runs; tickets keep their row with `conversation_id` set to null.** Privacy for chat content, while tickets remain the owner's business record.
- **Plan limits on bots (Free 1 / Pro 3) are enforced in Phase 2** together with bot CRUD.
- **Integration tests run against the local Supabase stack with real clients** (signed-in users via the publishable key, the service role via the secret key), not pgTAP. The same TypeScript helpers are reused by later phases. The runner refuses non-local API URLs.
- **Auth uses Server Actions + `@supabase/ssr`; identity comes from `getClaims()`** (verified JWT), never `getSession()`. `requireUser()` runs in every protected component and action; the proxy redirect is a convenience, not the guard.
- **The proxy only refreshes sessions on auth-aware paths** (`/dashboard/**`, `/login`, `/signup`, `/forgot-password`), so marketing pages stay static and fast.
- **`await connection()` before creating the session client.** Session-bound rendering is request-time anyway, and it stops Next's prefetch prerender from hitting supabase-js's `Date.now()` expiry check.
- **Forms post `locale` as a hidden field.** `next/root-params` is unavailable inside Server Actions.
- **Email links land on `/api/auth/callback`, which accepts both the PKCE `code` and `token_hash` flows.** With default templates the PKCE link must be opened in the browser that requested it; switching the templates to `token_hash` lifts that (optional manual step).
- **Our own per-IP limits on sign-in/sign-up/reset emails** (`check_rate_limit`, HMAC-hashed IP). Auth calls come from the server, so Supabase's per-IP limits would only see Vercel's address. Fails open, with one log line, when `IP_HASH_SALT` or the database is missing.
- **No account enumeration:** sign-up for an existing email and reset for an unknown email show the same "check your inbox" message.
- **The Google button renders only when Supabase reports the provider enabled** (`/auth/v1/settings`, cached for minutes). A disabled provider would otherwise end on a raw JSON error page.
- **Post-login redirects accept only same-origin relative paths** (`safeNextPath`: single leading slash, no backslashes or control characters, URL-parsed origin check).
- **The locale switcher uses full page loads with an explicit prefix (`/en/...`).** Client navigation between locales keeps the old `<html lang>` (wrong screen-reader voice), and an unprefixed URL would be bounced back by the old locale cookie.
- **The saved `ui_language` decides the locale after sign-in**, and changing it in Account switches the dashboard immediately.
- **`--input` darkened to `#958270`** so form-control borders reach 3:1 on every surface (WCAG 1.4.11); the contrast test enforces it.
- **Serbian copy avoids gendered verb forms** ("Drago nam je što si tu", "Zaboravljena lozinka?") because the owner's gender is unknown.
