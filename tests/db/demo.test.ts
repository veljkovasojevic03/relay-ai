import { beforeAll, describe, expect, it } from "vitest";

import { DEMO_BOT_PUBLIC_KEY, KROJ_FAQS, TRY_ORDERS } from "@/lib/demo/kroj";
import { createKrojBot, replaceKrojFaqs } from "@/lib/demo/workspace";
import { seedSandbox } from "@/lib/sandbox/seed";

import { adminClient, anonClient, axisVector, createUser, type Client } from "./helpers";

const db = () => adminClient();

/** A signed-in anonymous visitor, as the sandbox flow creates one. */
async function anonymousUser(): Promise<{ id: string; client: Client }> {
  const client = anonClient();
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("anonymous sign-in failed");
  return { id: data.user.id, client };
}

/** The demo store's bot with every FAQ indexed (created here if the stack has none). */
async function ensureIndexedDemoBot(): Promise<string> {
  const { data: existing } = await db()
    .from("bots")
    .select("id")
    .eq("public_key", DEMO_BOT_PUBLIC_KEY)
    .maybeSingle();
  let botId = existing?.id;
  if (!botId) {
    const owner = await createUser();
    await db().from("profiles").update({ plan: "pro" }).eq("id", owner.id);
    botId = await createKrojBot(db(), {
      ownerId: owner.id,
      publicKey: DEMO_BOT_PUBLIC_KEY,
      defaultLanguage: "sr",
      isDemo: true,
    });
    await replaceKrojFaqs(db(), botId);
  }
  // Only rows without a vector are touched, so a locally seeded demo bot keeps its real ones.
  const { error } = await db()
    .from("faqs")
    .update({ embedding: axisVector(7), embedding_status: "ready" })
    .eq("bot_id", botId)
    .neq("embedding_status", "ready");
  if (error) throw error;
  return botId;
}

describe("demo store data", () => {
  it("lists only orders that exist in demo_orders with that email and status", async () => {
    const { data, error } = await db()
      .from("demo_orders")
      .select("order_number, email, status")
      .in(
        "order_number",
        TRY_ORDERS.map((o) => o.orderNumber),
      );
    expect(error).toBeNull();
    const byNumber = new Map(data!.map((o) => [o.order_number, o]));
    for (const order of TRY_ORDERS) {
      expect(byNumber.get(order.orderNumber)).toEqual({
        order_number: order.orderNumber,
        email: order.email,
        status: order.status,
      });
    }
  });
});

describe("sandbox accounts", () => {
  it("makes every anonymous user a sandbox that expires in 7 days, and nobody else", async () => {
    const before = Date.now();
    const visitor = await anonymousUser();
    const owner = await createUser();
    const { data } = await db()
      .from("profiles")
      .select("id, is_sandbox, sandbox_expires_at")
      .in("id", [visitor.id, owner.id]);
    const sandbox = data!.find((p) => p.id === visitor.id)!;
    const regular = data!.find((p) => p.id === owner.id)!;

    expect(sandbox.is_sandbox).toBe(true);
    const expires = new Date(sandbox.sandbox_expires_at!).getTime();
    expect(expires - before).toBeGreaterThan(7 * 86_400_000 - 60_000);
    expect(expires - before).toBeLessThan(7 * 86_400_000 + 60_000);
    expect(regular).toMatchObject({ is_sandbox: false, sandbox_expires_at: null });
  });

  it("can't extend its own expiry", async () => {
    const visitor = await anonymousUser();
    const { error } = await visitor.client
      .from("profiles")
      .update({ sandbox_expires_at: new Date(Date.now() + 365 * 86_400_000).toISOString() })
      .eq("id", visitor.id);
    expect(error?.code).toBe("42501");
  });
});

describe("seedSandbox", () => {
  let demoBotId: string;

  beforeAll(async () => {
    demoBotId = await ensureIndexedDemoBot();
  });

  it("fills a sandbox with a bot, FAQs, history and an inbox its owner can see", async () => {
    const visitor = await anonymousUser();
    const { botId, pendingFaqIds } = await seedSandbox(db(), visitor.id, "sr");
    expect(pendingFaqIds).toEqual([]);

    // Everything is read back through RLS, as the dashboard reads it.
    const { data: bots } = await visitor.client
      .from("bots")
      .select("id, is_demo, default_language");
    expect(bots).toEqual([{ id: botId, is_demo: true, default_language: "sr" }]);

    const { data: faqs } = await visitor.client
      .from("faqs")
      .select("embedding_status")
      .eq("bot_id", botId);
    expect(faqs).toHaveLength(KROJ_FAQS.length);
    expect(faqs!.every((f) => f.embedding_status === "ready")).toBe(true);

    const { data: actions } = await visitor.client
      .from("bot_actions")
      .select("enabled, actions(name)")
      .eq("bot_id", botId);
    expect(actions!.filter((a) => a.enabled)).toHaveLength(2);

    const { count: chats } = await visitor.client
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("bot_id", botId);
    expect(chats).toBeGreaterThan(50);

    const { data: unread } = await visitor.client
      .from("conversations")
      .select("status")
      .eq("bot_id", botId)
      .eq("owner_unread", true);
    expect(unread!.map((c) => c.status).sort()).toEqual(["human", "waiting_human"]);

    const { count: unknown } = await visitor.client
      .from("unknown_questions")
      .select("id", { count: "exact", head: true })
      .eq("bot_id", botId)
      .eq("status", "open");
    expect(unknown).toBeGreaterThan(0);

    // The owner's reply in the seeded inbox became that question's draft answer.
    const { data: drafted } = await visitor.client
      .from("unknown_questions")
      .select("suggested_answer")
      .eq("bot_id", botId)
      .eq("question", "Mogu li da preuzmem porudžbinu u radnji?");
    expect(drafted![0]!.suggested_answer).toMatch(/^Može!/);
  });

  it("copies the demo bot's vectors instead of embedding again", async () => {
    const visitor = await anonymousUser();
    const { botId } = await seedSandbox(db(), visitor.id, "en");
    const question = KROJ_FAQS[0]!.question;
    const { data } = await db()
      .from("faqs")
      .select("bot_id, embedding")
      .in("bot_id", [botId, demoBotId])
      .eq("question", question);
    expect(data).toHaveLength(2);
    expect(data![0]!.embedding).toBe(data![1]!.embedding);
  });

  it("refuses an account that isn't a sandbox", async () => {
    const owner = await createUser();
    await expect(seedSandbox(db(), owner.id, "en")).rejects.toThrow("not a sandbox account");
    const { count } = await db()
      .from("bots")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", owner.id);
    expect(count).toBe(0);
  });

  it("is removed completely once it expires", async () => {
    const visitor = await anonymousUser();
    const { botId } = await seedSandbox(db(), visitor.id, "en");
    await db()
      .from("profiles")
      .update({ sandbox_expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", visitor.id);

    const { error } = await db().rpc("purge_expired_data");
    expect(error).toBeNull();

    const count = async (query: PromiseLike<{ count: number | null }>) => (await query).count;
    const rows = (table: "faqs" | "conversations" | "unknown_questions") =>
      db().from(table).select("id", { count: "exact", head: true }).eq("bot_id", botId);
    expect(
      await count(db().from("bots").select("id", { count: "exact", head: true }).eq("id", botId)),
    ).toBe(0);
    expect(await count(rows("faqs"))).toBe(0);
    expect(await count(rows("conversations"))).toBe(0);
    expect(await count(rows("unknown_questions"))).toBe(0);
    const { data } = await db().auth.admin.getUserById(visitor.id);
    expect(data.user).toBeNull();
  });
});
