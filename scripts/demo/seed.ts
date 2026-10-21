/**
 * Creates or updates the demo store's bot (spec Phase 9): the Kroj bot with its fixed public
 * key, 25 EN + 25 SR FAQs with embeddings, and both actions on. /demo embeds it, and every
 * new sandbox copies its FAQ vectors. Safe to run again: settings and FAQs are brought back
 * to the shipped set, conversations are kept.
 *
 *   pnpm demo:seed                     # owner: kroj-demo@relay-ai.invalid (no sign-in)
 *   pnpm demo:seed --email you@x.com   # first run only: an owner you can sign in as
 *                                      # (use "Forgot password" on /login), to watch the
 *                                      # demo bot's inbox
 *
 * Uses the service-role key from .env.local. Embeddings need the `embed` Edge Function
 * (deployed on cloud; locally `pnpm db:start:embed`). Without it the FAQs stay pending and
 * the script says so.
 */

import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { DEMO_BOT_PUBLIC_KEY, DEMO_OWNER_EMAIL } from "../../src/lib/demo/kroj";
import {
  createKrojBot,
  enableActions,
  krojBotSettings,
  replaceKrojFaqs,
} from "../../src/lib/demo/workspace";
import { embedTexts, toPgVector } from "../../src/lib/faqs/embed";
import { faqEmbeddingText } from "../../src/lib/faqs/text";
import { adminClient, loadEnv, parseArgs } from "../n8n/common";

async function main() {
  loadEnv();
  const { values } = parseArgs(process.argv.slice(2));
  const db = adminClient();
  if (!db) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.",
    );
    process.exit(2);
  }

  const { data: existing, error } = await db
    .from("bots")
    .select("id, owner_id")
    .eq("public_key", DEMO_BOT_PUBLIC_KEY)
    .maybeSingle();
  if (error) throw new Error(`bot lookup failed (${error.code})`);

  let botId: string;
  if (existing) {
    botId = existing.id;
    const { error: updateError } = await db
      .from("bots")
      .update({ ...krojBotSettings("sr"), is_demo: true })
      .eq("id", botId);
    if (updateError) throw new Error(`bot update failed (${updateError.code})`);
    await enableActions(db, botId);
    if (values.email) console.log("  The demo bot already exists; its owner stays unchanged.");
    console.log("✓ Demo bot settings updated.");
  } else {
    const ownerId = await demoOwner(db, values.email ?? DEMO_OWNER_EMAIL);
    botId = await createKrojBot(db, {
      ownerId,
      publicKey: DEMO_BOT_PUBLIC_KEY,
      defaultLanguage: "sr",
      isDemo: true,
    });
    console.log("✓ Demo bot created.");
  }

  // Vectors of unchanged questions are kept (embeddings use the question only).
  const pending = await replaceKrojFaqs(db, botId, botId);
  const failed = await embed(db, botId, pending);
  console.log(
    `✓ 50 FAQs in place, ${50 - failed} indexed` +
      (failed ? `; ${failed} still pending (is the embed function running?)` : "."),
  );
  const app = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  console.log(`  Open ${new URL("/demo", app)} to try it.`);
}

/**
 * The demo bot's owner: an existing account with that email, or a new one with a random
 * password nobody knows. Pro plan, so the public demo has 1,000 conversations a month.
 */
async function demoOwner(db: SupabaseClient, email: string): Promise<string> {
  const { data: profile } = await db
    .from("profiles")
    .select("id")
    .eq("notification_email", email)
    .maybeSingle();
  let id = profile?.id as string | undefined;
  if (!id) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: randomBytes(32).toString("base64url"),
      email_confirm: true,
      user_metadata: { display_name: "Kroj (demo)", ui_language: "sr" },
    });
    if (error) throw new Error(`demo owner create failed (${error.code ?? error.message})`);
    id = data.user.id;
    console.log(`✓ Demo owner ${email} created.`);
  }
  const { error } = await db.from("profiles").update({ plan: "pro" }).eq("id", id);
  if (error) throw new Error(`demo owner plan update failed (${error.code})`);
  return id;
}

/** Embeds the given FAQs; returns how many are still without a vector. */
async function embed(db: SupabaseClient, botId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await db.from("faqs").select("id, question").in("id", ids);
  if (error) throw new Error(`faq load failed (${error.code})`);
  let vectors: number[][];
  try {
    vectors = await embedTexts(data.map(faqEmbeddingText), {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      secretKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      timeoutMs: 120_000,
    });
  } catch (e) {
    console.warn(`  Embedding failed: ${e instanceof Error ? e.message : e}`);
    return ids.length;
  }
  const results = await Promise.all(
    data.map((faq, i) =>
      db
        .from("faqs")
        .update({ embedding: toPgVector(vectors[i]!), embedding_status: "ready" })
        .eq("bot_id", botId)
        .eq("id", faq.id),
    ),
  );
  return results.filter((r) => r.error).length;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
