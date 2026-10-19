# Relay AI

> **Answers first. Humans when it matters.**

An embeddable support chatbot for small web shops. You add FAQ entries and paste one `<script>` line
on your site. Visitors get an instant answer that cites its source, and when the bot doesn't know,
the chat is handed off to you in a live inbox. It runs on free tiers only.

> Status: **Phase 0: foundation.** Features land phase by phase; see `docs/DECISIONS.md`.

## Stack

Next.js (App Router, TypeScript strict) · Tailwind CSS · Supabase (Postgres, RLS, Realtime,
pgvector) · vanilla TypeScript widget (Shadow DOM, esbuild) · Anthropic Claude (optional) ·
Stripe (test mode) · n8n (self-hosted) · Vitest · Playwright · GitHub Actions · Vercel Hobby.

## Getting started

Requirements: Node 24 (`.nvmrc`) and pnpm 12.

```bash
pnpm install
cp .env.example .env.local   # every integration is optional
pnpm dev                     # http://localhost:3000
```

Without credentials the app still runs: the bot answers in **Sample mode**, n8n events go to a
**simulated** dispatcher, and billing is disabled. `GET /api/health` shows which integrations are
configured.

## Scripts

| Command          | What it does                          |
| ---------------- | ------------------------------------- |
| `pnpm dev`       | Dev server                            |
| `pnpm lint`      | ESLint                                |
| `pnpm typecheck` | Generate route types + `tsc --noEmit` |
| `pnpm test`      | Unit tests (Vitest)                   |
| `pnpm test:e2e`  | E2E tests against a production build  |
| `pnpm build`     | Production build                      |
| `pnpm format`    | Prettier                              |

## Security

- Secrets live only in `.env.local` (git-ignored) and in Vercel / GitHub settings. CI runs
  **gitleaks** on every push.
- The app refuses to start with a live Stripe key. It only runs in test mode.
- Logs are structured JSON. They never contain message content, emails or secrets.
