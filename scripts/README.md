# scripts/

Developer scripts run through `pnpm` (TypeScript via `tsx`):

- `eval-retrieval.ts` → `pnpm eval:retrieval` (local stack with the Edge runtime only)
- `local-supabase.mjs` → runs a command with the local stack's env (tests, e2e builds)
- `n8n/send-event.ts` → `pnpm n8n:send <escalation|reply_email|order_status|create_ticket>`:
  a signed sample event at your n8n workflows (`--bad-signature`, `--stale`, `--no-signature`,
  `--nasty`, `--test`, `--to`; see `n8n/README.md`)
- `n8n/verify.ts` → `pnpm n8n:verify`: the app's callback endpoint against its rejection rules
- `demo/seed.ts` → `pnpm demo:seed [--email you@example.com]`: creates or updates the demo
  store's bot (fixed key `kroj-demo-store-bot`, 50 FAQs with embeddings, both actions on).
  `/demo` embeds it and every sandbox copies its vectors. Run once per Supabase project
- `demo/mark-demo-bot.ts` → `pnpm demo:mark-bot <public_key>`: lets one of your own bots offer
  `order_status` against the demo orders
- `demo/seed-analytics.ts` → `pnpm demo:seed-analytics <public_key> [--days 30] [--clear]`:
  30 days of plausible conversation history for Analytics (removable with `--clear`)
- `db-hardening.sql`: catalog checks CI runs with `psql` after the migrations (RLS on every
  table, pinned `search_path` on every `SECURITY DEFINER` function)
