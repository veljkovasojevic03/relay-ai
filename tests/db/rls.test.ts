import { beforeAll, describe, expect, it } from "vitest";

import {
  adminClient,
  anonClient,
  createBot,
  createUser,
  startConversation,
  type TestUser,
} from "./helpers";

// Two owners. Alice has a bot with data in every owner-scoped table; Bob must not be able
// to read or change any of it.
let alice: TestUser;
let bob: TestUser;
let aliceBotId: string;
let aliceFaqId: string;
let aliceConversationId: string;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createUser(), createUser()]);
  aliceBotId = (await createBot(alice, "Alice shop")).id;

  const faq = await alice.client
    .from("faqs")
    .insert({ bot_id: aliceBotId, question: "Shipping time?", answer: "2-3 days." })
    .select()
    .single();
  if (faq.error) throw faq.error;
  aliceFaqId = faq.data.id;

  const started = await startConversation(aliceBotId);
  aliceConversationId = started.conversation_id!;

  const admin = adminClient();
  const action = await admin.from("actions").select("id").eq("name", "create_ticket").single();
  const seeds = await Promise.all([
    admin.from("messages").insert({
      conversation_id: aliceConversationId,
      bot_id: aliceBotId,
      role: "visitor",
      content: "Hello",
    }),
    admin.from("unknown_questions").insert({
      bot_id: aliceBotId,
      conversation_id: aliceConversationId,
      question: "Do you ship to Mars?",
    }),
    admin.from("tickets").insert({ bot_id: aliceBotId, subject: "Broken zipper" }),
    admin.from("action_runs").insert({
      bot_id: aliceBotId,
      conversation_id: aliceConversationId,
      action_name: "create_ticket",
    }),
    admin.from("bot_actions").insert({ bot_id: aliceBotId, action_id: action.data!.id }),
    admin.from("n8n_outbox").insert({ owner_id: alice.id, type: "escalation", payload: {} }),
  ]);
  for (const seed of seeds) if (seed.error) throw seed.error;
});

const ownerScopedTables = [
  "bots",
  "faqs",
  "conversations",
  "messages",
  "unknown_questions",
  "tickets",
  "action_runs",
  "bot_actions",
  "n8n_outbox",
  "usage_counters",
] as const;

describe("tenant isolation", () => {
  it.each(ownerScopedTables)("alice can read her own %s", async (table) => {
    const { data, error } = await alice.client.from(table).select("id");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it.each(ownerScopedTables)("bob sees none of alice's %s", async (table) => {
    const { data, error } = await bob.client.from(table).select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("bob only sees his own profile", async () => {
    const { data } = await bob.client.from("profiles").select("id");
    expect(data).toEqual([{ id: bob.id }]);
  });

  it("bob cannot update or delete alice's bot", async () => {
    const update = await bob.client
      .from("bots")
      .update({ name: "Hijacked" })
      .eq("id", aliceBotId)
      .select();
    expect(update.data).toEqual([]);

    const remove = await bob.client.from("bots").delete().eq("id", aliceBotId).select();
    expect(remove.data).toEqual([]);

    const check = await adminClient().from("bots").select("name").eq("id", aliceBotId).single();
    expect(check.data?.name).toBe("Alice shop");
  });

  it("bob cannot edit, delete or add FAQs on alice's bot", async () => {
    const update = await bob.client
      .from("faqs")
      .update({ answer: "Never." })
      .eq("id", aliceFaqId)
      .select();
    expect(update.data).toEqual([]);

    const remove = await bob.client.from("faqs").delete().eq("id", aliceFaqId).select();
    expect(remove.data).toEqual([]);

    const insert = await bob.client
      .from("faqs")
      .insert({ bot_id: aliceBotId, question: "Injected?", answer: "Yes." });
    expect(insert.error?.code).toBe("42501");
  });

  it("bob cannot resolve or delete alice's conversations", async () => {
    const update = await bob.client
      .from("conversations")
      .update({ status: "resolved" })
      .eq("id", aliceConversationId)
      .select();
    expect(update.data).toEqual([]);

    const remove = await bob.client
      .from("conversations")
      .delete()
      .eq("id", aliceConversationId)
      .select();
    expect(remove.data).toEqual([]);

    const check = await adminClient()
      .from("conversations")
      .select("status")
      .eq("id", aliceConversationId)
      .single();
    expect(check.data?.status).toBe("bot");
  });

  it("bob cannot attach actions to alice's bot", async () => {
    const action = await bob.client
      .from("actions")
      .select("id")
      .eq("name", "order_status")
      .single();
    const insert = await bob.client
      .from("bot_actions")
      .insert({ bot_id: aliceBotId, action_id: action.data!.id, enabled: true });
    expect(insert.error?.code).toBe("42501");
  });

  it("the action registry is readable by every owner", async () => {
    const { data } = await bob.client.from("actions").select("name").order("name");
    expect(data?.map((a) => a.name)).toEqual(["create_ticket", "order_status"]);
  });
});

describe("server-only tables", () => {
  it.each(["demo_orders", "stripe_events", "rate_limits", "seen_event_ids"] as const)(
    "owners have no access to %s",
    async (table) => {
      const { error } = await alice.client.from(table).select("id");
      expect(error?.code).toBe("42501");
    },
  );
});

describe("anonymous access", () => {
  it.each([...ownerScopedTables, "profiles", "actions", "demo_orders"] as const)(
    "anon cannot read %s",
    async (table) => {
      const { error } = await anonClient().from(table).select("id");
      expect(error?.code).toBe("42501");
    },
  );
});
