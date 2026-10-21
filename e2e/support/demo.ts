import { randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { DEMO_BOT_PUBLIC_KEY } from "../../src/lib/demo/kroj";
import { createKrojBot, replaceKrojFaqs } from "../../src/lib/demo/workspace";

export const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

/**
 * The demo store's bot, as `pnpm demo:seed` creates it, minus the embeddings (CI has no
 * embed function; guided action flows don't need them). Reused when it already exists.
 */
export async function ensureDemoBot(): Promise<string> {
  const db = admin();
  const { data: existing } = await db
    .from("bots")
    .select("id")
    .eq("public_key", DEMO_BOT_PUBLIC_KEY)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db.auth.admin.createUser({
    email: `demo-owner-${randomUUID().slice(0, 8)}@relay.test`,
    password: randomBytes(18).toString("base64url"),
    email_confirm: true,
  });
  if (error) throw error;
  await db.from("profiles").update({ plan: "pro" }).eq("id", data.user.id);
  try {
    const botId = await createKrojBot(db, {
      ownerId: data.user.id,
      publicKey: DEMO_BOT_PUBLIC_KEY,
      defaultLanguage: "sr",
      isDemo: true,
    });
    await replaceKrojFaqs(db, botId);
    return botId;
  } catch (e) {
    // Another worker created it first: use that one.
    const { data: winner } = await db
      .from("bots")
      .select("id")
      .eq("public_key", DEMO_BOT_PUBLIC_KEY)
      .maybeSingle();
    if (winner) return winner.id as string;
    throw e;
  }
}
