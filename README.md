# Relay AI

> **Answers first. Humans when it matters.** · _Prvo odgovor. Čovek kad je bitno._

An embeddable support chatbot for small web shops. You add your FAQ and paste one `<script>`
line on your site. Visitors then get instant answers that cite their source. When the bot
doesn't know, the chat is handed off to you in a live inbox. Everything runs on free tiers.

> Status: **Phase 0: foundation.** Features land phase by phase; decisions are logged in
> [`docs/DECISIONS.md`](docs/DECISIONS.md) and the design system in
> [`docs/STYLE_GUIDE.md`](docs/STYLE_GUIDE.md).

## Stack

Next.js 16 (App Router, TypeScript strict) · Tailwind CSS 4 · shadcn/ui · next-intl (EN/SR) ·
Supabase (Postgres, RLS, Realtime, pgvector, Edge Functions) · vanilla TypeScript widget
(Shadow DOM, esbuild) · Anthropic Claude (optional) · Stripe (test mode) · n8n (self-hosted) ·
Vitest · Playwright · GitHub Actions · Vercel Hobby.

## Repository layout

| Path        | Contents                                                     |
| ----------- | ------------------------------------------------------------ |
| `src/`      | Next.js app: pages, API routes, shared libraries             |
| `messages/` | UI copy (`en.json`, `sr.json`)                               |
| `supabase/` | CLI config, SQL migrations, Edge Functions                   |
| `widget/`   | Embeddable chat widget source (built to `public/widget.js`)  |
| `n8n/`      | Local n8n setup (workflows are built by hand, not committed) |
| `eval/`     | Retrieval and adversarial test sets                          |
| `scripts/`  | Developer scripts (evals, signed n8n test events)            |
| `e2e/`      | Playwright tests                                             |
| `docs/`     | Decisions, style guide, contracts, reports                   |

## Getting started

Requirements: Node 24 (`.nvmrc`) and pnpm 12.

```bash
pnpm install
cp .env.example .env.local   # every integration is optional
pnpm dev                     # http://localhost:3000 (EN) and /sr (SR)
```

Without credentials the app still runs: the bot answers in **Sample mode**, n8n events go to a
**simulated** dispatcher, billing is off, and `GET /api/health` reports `degraded`.

To connect Supabase, fill in the three `SUPABASE` values in `.env.local`, then apply the
migrations:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <your-project-ref>
pnpm exec supabase db push
```

`/api/health` then reports `"status": "ok"` with the database latency.

## Scripts

| Command             | What it does                          |
| ------------------- | ------------------------------------- |
| `pnpm dev`          | Dev server                            |
| `pnpm lint`         | ESLint                                |
| `pnpm typecheck`    | Generate route types + `tsc --noEmit` |
| `pnpm test`         | Unit tests (Vitest)                   |
| `pnpm test:e2e`     | E2E tests against a production build  |
| `pnpm build`        | Production build                      |
| `pnpm format`       | Prettier                              |
| `pnpm format:check` | Prettier check (CI)                   |

## Automation

- **CI** (`.github/workflows/ci.yml`): gitleaks secret scan, then format check, lint,
  typecheck, unit tests, build and E2E on every push and PR.
- **Cron** (`.github/workflows/cron.yml`): hourly `POST /api/cron/tick`, which keeps the free
  Supabase project awake. It needs the repo secrets `APP_URL` and `CRON_SECRET`. GitHub may
  delay or skip scheduled runs, so nothing depends on exact timing.

## Security

- Secrets live only in `.env.local` (git-ignored) and in Vercel / GitHub settings. CI runs
  **gitleaks** on every push.
- The app refuses to start with a live Stripe key. It only runs in test mode.
- Cron and other shared-secret endpoints compare secrets in constant time and never fall back
  to "open" when a secret is missing.
- Logs are structured JSON. They never contain message content, emails or secrets.
