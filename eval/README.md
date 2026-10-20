# eval/

Quality gates.

- `faq-retrieval.json`: the golden retrieval set for the Kroj demo bot
  (`src/lib/demo/kroj-faqs.json`). Each query names the FAQ key it should match, or `null` when
  the bot should decline. Run `pnpm db:start:embed`, then `pnpm eval:retrieval`; the results go
  to `docs/RETRIEVAL_REPORT.md`. Re-run it whenever the embedding text, the retrieval settings
  (`src/lib/faqs/retrieval.ts`) or `match_faqs` change.
- `adversarial.json`: prompt-injection set (**Phase 10**).
