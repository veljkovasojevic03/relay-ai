# Relay AI

> **Answers first. Humans when it matters.** · _Prvo odgovor. Čovek kad je bitno._

An embeddable support chatbot for small web shops. You add your FAQ and paste one `<script>`
line on your site. Visitors then get instant answers that cite their source. When the bot
doesn't know, the chat is handed off to you in a live inbox. Everything runs on free tiers.

> Status: **Phase 5: the widget.** Features land phase by phase; decisions are logged in
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

### Local database (Docker)

Tests never touch the cloud project. They run against a disposable local Supabase stack
(needs Docker Desktop):

```bash
pnpm db:start      # local Postgres, Auth, Realtime, Storage + all migrations
pnpm test:db       # RLS isolation, column grants, quota/rate-limit races, retrieval, purge
pnpm e2e:local     # build + Playwright, including sign-up, sign-in and password reset by email
pnpm db:stop
```

`pnpm db:start` leaves out the Edge runtime to stay light, so FAQs saved locally show as
"Not indexed". Use `pnpm db:start:embed` to run the `embed` function too. On every start the
runtime downloads the gte-small model (about 130 MB) on the first request, which can take a few
minutes on a slow connection; after that a request takes a fraction of a second.

Local emails (confirmations, password resets) land in Mailpit at http://127.0.0.1:54324.
After changing a migration: `pnpm db:reset`, then `pnpm db:types` to regenerate
`src/lib/supabase/database.types.ts` (CI fails if it is stale).

## Scripts

| Command               | What it does                                        |
| --------------------- | --------------------------------------------------- |
| `pnpm dev`            | Dev server                                          |
| `pnpm lint`           | ESLint                                              |
| `pnpm typecheck`      | Generate route types + `tsc --noEmit`               |
| `pnpm test`           | Unit tests (Vitest)                                 |
| `pnpm test:e2e`       | E2E tests against a production build                |
| `pnpm test:db`        | Database integration tests (local)                  |
| `pnpm e2e:local`      | Build + E2E against local Supabase                  |
| `pnpm db:start`       | Start the local Supabase stack                      |
| `pnpm db:start:embed` | Same, plus the Edge runtime (`embed`)               |
| `pnpm eval:retrieval` | Retrieval eval → `docs/RETRIEVAL_REPORT.md` (local) |
| `pnpm db:reset`       | Re-create the local DB from migrations              |
| `pnpm db:lint`        | Lint SQL (plpgsql_check)                            |
| `pnpm db:types`       | Regenerate database TypeScript types                |
| `pnpm build`          | Widget + production build                           |
| `pnpm widget:watch`   | Rebuild the widget on change                        |
| `pnpm format`         | Prettier                                            |
| `pnpm format:check`   | Prettier check (CI)                                 |

## Knowledge and retrieval

Owners write FAQ entries (or paste them as `Q:`/`A:` blocks) in English and Serbian. Each
question is embedded by the `embed` Edge Function (Supabase's built-in `gte-small`, 384
dimensions, no external API) and searched with pgvector plus Postgres full-text search. The
**Test your bot** page shows the matches, their scores and the reply the bot would give.

gte-small is an English model. Serbian works, but less well: the bot answers fewer Serbian
questions on its own and offers the closest questions as suggestions instead. The measured
numbers, and how the thresholds were chosen, are in
[`docs/RETRIEVAL_REPORT.md`](docs/RETRIEVAL_REPORT.md).

To deploy the function to your project:

```bash
pnpm exec supabase functions deploy embed
```

It authenticates callers with the project's **secret key** (`sb_secret_…`), so
`SUPABASE_SERVICE_ROLE_KEY` must hold that key, not the legacy service-role JWT.

## The widget

`public/widget.js` is a dependency-free TypeScript bundle (about 9 KB gzipped; the build fails
above 30 KB) that renders inside a Shadow DOM, so the shop's CSS can't change it and it can't
change the shop. Paste the snippet from the bot's settings page before `</body>`:

```html
<script src="https://<your-app>/widget.js" data-bot="<public key>" async></script>
```

Add `data-lang="sr"` (or `en`) to force a language; otherwise the page's `<html lang>` and then
the browser decide. The widget only answers on websites listed under the bot's **Allowed
websites**. Elsewhere it stays hidden and logs a console warning.

`pnpm build` and `pnpm dev` build the widget first; run `pnpm widget:watch` while working on
`widget/src`.

## Public widget API

The widget talks to these endpoints (CORS only for the bot's allowed websites):

| Endpoint                            | What it does                                                  |
| ----------------------------------- | ------------------------------------------------------------- |
| `GET /api/widget/config?bot=`       | Public bot settings and whether new chats can start           |
| `POST /api/widget/message`          | `{bot, text, locale}` → the bot's reply as Server-Sent Events |
| `GET /api/widget/poll?bot=&since=`  | New human/system messages (fallback for Realtime)             |
| `GET /api/widget/conversation?bot=` | The whole conversation, to resume after a refresh             |
| `POST /api/widget/rate`             | `{bot, rating: "up" \| "down"}`                               |
| `POST /api/widget/end`              | `{bot}`: the visitor closes the chat                          |

The first message starts a conversation and returns a token once, in the `meta` event. Send it
back as `X-Relay-Token` on later calls. Try it against a bot with a few FAQs:

```bash
curl -N -X POST http://localhost:3000/api/widget/message \
  -H "Content-Type: application/json" \
  -d '{"bot":"<public key>","text":"How long does delivery take?"}'
```

```text
event: meta
data: {"token":"…","mode":"sample","language":"en"}

event: delta
data: {"text":"Orders placed by"}
…
event: sources
data: {"faqs":[{"id":"…","question":"How long does delivery take?"}]}

event: done
data: {"outcome":"answered","offerHuman":false,"suggestions":[],"remainingMessages":19}
```

Without `ANTHROPIC_API_KEY` (and until Live mode lands) every answer is **Sample**: the matched
FAQ's answer word for word. Errors are JSON with a status code, for example
`{"error":"origin_not_allowed"}` (403) or `{"error":"message_cap_reached"}` (429).

## Automation

- **CI** (`.github/workflows/ci.yml`): gitleaks secret scan, then format check, lint,
  typecheck and unit tests. After that it starts a local Supabase stack and runs the SQL lint,
  a check that the generated DB types are current, the DB tests, and finally build + E2E
  against that stack. This runs on every push and PR.
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
