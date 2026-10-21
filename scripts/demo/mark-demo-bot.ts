/**
 * Marks one of your bots as the demo store's bot, so it may offer `order_status` (which reads
 * the seeded demo orders). Phase 9 seeds the real demo bot; this is for trying the flow now.
 *
 *   pnpm demo:mark-bot <public_key>          # mark
 *   pnpm demo:mark-bot <public_key> --off    # unmark
 *
 * Uses the service-role key from .env.local (owners can't change `is_demo` themselves).
 */

import { adminClient, loadEnv } from "../n8n/common";

async function main() {
  loadEnv();
  const [key, flag] = process.argv.slice(2);
  if (!key || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) {
    console.error(
      "Usage: pnpm demo:mark-bot <public_key> [--off]  (the key is in the bot's embed snippet)",
    );
    process.exit(2);
  }
  const db = adminClient();
  if (!db) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.",
    );
    process.exit(2);
  }
  const isDemo = flag !== "--off";
  const { data, error } = await db
    .from("bots")
    .update({ is_demo: isDemo })
    .eq("public_key", key)
    .select("name");
  if (error) throw new Error(`update failed (${error.code})`);
  if (!data.length) {
    console.error("No bot with that public key.");
    process.exit(1);
  }
  console.log(`✓ "${data[0]!.name}" ${isDemo ? "is now" : "is no longer"} the demo bot.`);
  if (isDemo) console.log("  Next: Dashboard → the bot → Actions → switch on Order status.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
