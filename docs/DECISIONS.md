# Decisions

One line per decision: what + why. Newest at the bottom.

- **Phase list missing from spec → Phase 0 = foundation only** (repo, tooling, env contract, CI). Spec references phases but doesn't list them; foundation is the only safe assumption.
- **Next.js 16.4 with `cacheComponents` on** (create-next-app default). Dynamic route handlers opt out with `await connection()`; matches where Next is heading.
- **pnpm 12, Node 24** (`.nvmrc`, `engines`). Current LTS; pnpm 12 `allowBuilds` keeps install scripts opt-in.
- **Single app package for now; `widget/` added as its own esbuild build in the widget phase.** No monorepo tooling until there's a second package.
- **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** instead of the legacy anon key name — Supabase's current key model for new projects.
- **All integrations optional in the env schema**; features check `has*()` helpers and degrade (Sample mode, simulated n8n, billing off). Enforces the "graceful fallback, no fake stubs" rule.
- **Non-test Stripe keys are rejected at boot.** The $0 / Hobby-plan rule must be impossible to break by misconfiguration.
- **Env validation errors list variable names, never values.** Avoids leaking secrets into logs.
- **Structured JSON logger with flat scalar fields only.** Makes it hard to accidentally log message bodies or objects containing PII.
- **Baseline security headers now (nosniff, referrer, SAMEORIGIN, permissions); strict CSP later** when the third-party origins it must allow exist. SAMEORIGIN (not DENY) so the landing page can frame `/demo`.
- **`/api/health` reports integration configuration until the Supabase client exists**; the real DB round-trip replaces `db` in the Supabase phase.
- **Default models `claude-haiku-4-5` (Free) / `claude-sonnet-5-5` (Pro)**, overridable via env; re-verify against Anthropic docs when Live mode is built.
- **E2E runs against `next start` (production build)** so CI tests what Vercel serves.
- **`.gitattributes` forces LF** — repo is developed on Windows, CI runs on Linux.
