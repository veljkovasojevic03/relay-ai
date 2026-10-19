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
