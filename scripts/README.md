# scripts/

Developer scripts run through `pnpm` (TypeScript via `tsx`):

- `eval-retrieval.ts` → `pnpm eval:retrieval` (local stack with the Edge runtime only)
- `local-supabase.mjs` → runs a command with the local stack's env (tests, e2e builds)
- `n8n/send-event.ts` → `pnpm n8n:send <escalation|reply_email|order_status|create_ticket>`:
  a signed sample event at your n8n workflows (`--bad-signature`, `--stale`, `--no-signature`,
  `--nasty`, `--test`, `--to`; see `n8n/README.md`)
- `n8n/verify.ts` → `pnpm n8n:verify`: the app's callback endpoint against its rejection rules
- `demo/mark-demo-bot.ts` → `pnpm demo:mark-bot <public_key>`: lets one of your bots offer
  `order_status` before Phase 9 seeds the real demo bot
- later: the adversarial eval (**Phase 10**)
