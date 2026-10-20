# scripts/

Developer scripts run through `pnpm` (TypeScript via `tsx`):

- `eval-retrieval.ts` → `pnpm eval:retrieval` (local stack with the Edge runtime only)
- `local-supabase.mjs` → runs a command with the local stack's env (tests, e2e builds)
- later: the adversarial eval (**Phase 10**) and signed n8n test events (`pnpm n8n:send`,
  `pnpm n8n:verify`, **Phase 7**)
