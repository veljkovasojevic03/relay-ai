import "server-only";

import { randomInt } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { seedAnalytics } from "@/lib/demo/analytics-seed";
import { DEMO_BOT_PUBLIC_KEY, type Lang } from "@/lib/demo/kroj";
import { createKrojBot, replaceKrojFaqs, seedInbox } from "@/lib/demo/workspace";

/** How long a sandbox lives; the database sets the expiry (`handle_new_user`). */
export const SANDBOX_DAYS = 7;

/**
 * Fills a fresh sandbox account: the Kroj bot (both actions on), its 50 FAQs, 30 days of
 * conversation history with unknown questions, and two chats waiting in the inbox.
 * Refuses accounts that aren't sandboxes, so a bug can't pour demo data into a real one.
 * Returns the FAQ ids that still need a vector (only when the demo bot isn't indexed).
 */
export async function seedSandbox(
  db: SupabaseClient,
  ownerId: string,
  language: Lang,
): Promise<{ botId: string; pendingFaqIds: string[] }> {
  const { data: profile, error } = await db
    .from("profiles")
    .select("is_sandbox")
    .eq("id", ownerId)
    .single();
  if (error) throw new Error(`sandbox profile lookup failed (${error.code})`);
  if (!profile.is_sandbox) throw new Error("not a sandbox account");

  const { data: demoBot } = await db
    .from("bots")
    .select("id")
    .eq("public_key", DEMO_BOT_PUBLIC_KEY)
    .maybeSingle();

  // `is_demo`, so the order-status action works against the seeded demo orders.
  const botId = await createKrojBot(db, { ownerId, defaultLanguage: language, isDemo: true });
  const pendingFaqIds = await replaceKrojFaqs(db, botId, demoBot?.id ?? null);
  await seedAnalytics(db, botId, { days: 30, seed: randomInt(1, 2 ** 31) });
  await seedInbox(db, botId);
  return { botId, pendingFaqIds };
}
