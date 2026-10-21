/**
 * Fills one of your bots with plausible conversation history, so Analytics has something
 * to show before real visitors arrive. Phase 9's sandbox uses the same generator.
 *
 *   pnpm demo:seed-analytics <public_key>            # 30 days of history
 *   pnpm demo:seed-analytics <public_key> --days 90
 *   pnpm demo:seed-analytics <public_key> --clear    # remove what this script added
 *
 * Uses the service-role key from .env.local. Seeded chats are marked and never mixed up
 * with real ones: --clear removes only those.
 */

import { clearSeededAnalytics, seedAnalytics } from "../../src/lib/demo/analytics-seed";
import { adminClient, loadEnv, parseArgs } from "../n8n/common";

async function main() {
  loadEnv();
  const { flags, values, positional } = parseArgs(process.argv.slice(2));
  const key = positional[0];
  if (!key || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) {
    console.error("Usage: pnpm demo:seed-analytics <public_key> [--days 30] [--clear]");
    process.exit(2);
  }
  const db = adminClient();
  if (!db) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.",
    );
    process.exit(2);
  }
  const { data: bot } = await db
    .from("bots")
    .select("id, name")
    .eq("public_key", key)
    .maybeSingle();
  if (!bot) {
    console.error("No bot with that public key.");
    process.exit(1);
  }

  const removed = await clearSeededAnalytics(db, bot.id);
  if (flags.has("clear")) {
    console.log(`✓ Removed ${removed} seeded conversations from "${bot.name}".`);
    return;
  }
  const days = Math.min(Math.max(Number(values.days ?? 30) || 30, 1), 90);
  const result = await seedAnalytics(db, bot.id, { days });
  console.log(
    `✓ "${bot.name}": ${result.conversations} conversations over ${days} days, ` +
      `${result.unknown} unknown questions (${result.humanReplies} answered by you).` +
      (removed ? ` Replaced ${removed} seeded earlier.` : ""),
  );
  console.log("  Open Dashboard → Analytics. Remove them with --clear.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
