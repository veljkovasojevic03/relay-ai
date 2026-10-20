import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  adminClient,
  axisVector,
  createBot,
  createUser,
  startConversation,
  tokenHash,
  type TestUser,
} from "./helpers";

const period = () => new Date().toISOString().slice(0, 7);

describe("start_conversation", () => {
  let owner: TestUser;
  let botId: string;

  beforeAll(async () => {
    owner = await createUser();
    botId = (await createBot(owner)).id;
  });

  it("creates a conversation with a random channel and counts it", async () => {
    const result = await startConversation(botId);
    expect(result.status).toBe("ok");
    expect(result.realtime_channel).toMatch(/^[0-9a-f]{32}$/);

    const admin = adminClient();
    const row = await admin
      .from("conversations")
      .select("bot_id, status, token_hash")
      .eq("id", result.conversation_id!)
      .single();
    expect(row.data).toMatchObject({ bot_id: botId, status: "bot" });
    expect(row.data?.token_hash).toMatch(/^[0-9a-f]{64}$/);

    const usage = await admin
      .from("usage_counters")
      .select("conversations_started")
      .eq("profile_id", owner.id)
      .eq("period", period())
      .single();
    expect(usage.data?.conversations_started).toBe(1);
  });

  it("reports unknown and inactive bots", async () => {
    expect((await startConversation(randomUUID())).status).toBe("bot_not_found");
    await owner.client.from("bots").update({ active: false }).eq("id", botId);
    expect((await startConversation(botId)).status).toBe("bot_inactive");
    await owner.client.from("bots").update({ active: true }).eq("id", botId);
  });

  it("is atomic under concurrency: never exceeds the monthly quota", async () => {
    const quotaOwner = await createUser();
    const quotaBot = (await createBot(quotaOwner)).id;
    const admin = adminClient();
    // Free plan allows 50 per month; start at 45 so exactly 5 of 20 parallel calls fit.
    await admin
      .from("usage_counters")
      .insert({ profile_id: quotaOwner.id, period: period(), conversations_started: 45 });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => startConversation(quotaBot)),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === "ok")).toHaveLength(5);
    expect(statuses.filter((s) => s === "quota_exceeded")).toHaveLength(15);

    const usage = await admin
      .from("usage_counters")
      .select("conversations_started")
      .eq("profile_id", quotaOwner.id)
      .single();
    expect(usage.data?.conversations_started).toBe(50);

    const { count } = await admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("bot_id", quotaBot);
    expect(count).toBe(5);

    // Upgrading lifts the limit immediately.
    await admin.from("profiles").update({ plan: "pro" }).eq("id", quotaOwner.id);
    expect((await startConversation(quotaBot)).status).toBe("ok");
  });

  it("rolls the counter back when the insert fails", async () => {
    const admin = adminClient();
    const hash = tokenHash();
    const args = { p_bot_id: botId, p_token_hash: hash, p_language: "en", p_ip_hash: "x" };
    const before = await admin
      .from("usage_counters")
      .select("conversations_started")
      .eq("profile_id", owner.id)
      .single();

    expect((await admin.rpc("start_conversation", args)).error).toBeNull();
    const duplicate = await admin.rpc("start_conversation", args);
    expect(duplicate.error?.code).toBe("23505");

    const after = await admin
      .from("usage_counters")
      .select("conversations_started")
      .eq("profile_id", owner.id)
      .single();
    expect(after.data!.conversations_started).toBe(before.data!.conversations_started + 1);
  });
});

describe("check_rate_limit", () => {
  const call = (key: string, limit: number, windowSeconds: number) =>
    adminClient()
      .rpc("check_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds })
      .then(({ data, error }) => {
        if (error) throw error;
        return data;
      });

  it("allows exactly `limit` hits per window, even when they race", async () => {
    const key = `test:${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 25 }, () => call(key, 10, 3600)));
    expect(results.filter(Boolean)).toHaveLength(10);
  });

  it("keeps keys independent", async () => {
    const a = `test:${randomUUID()}`;
    const b = `test:${randomUUID()}`;
    expect(await call(a, 1, 3600)).toBe(true);
    expect(await call(a, 1, 3600)).toBe(false);
    expect(await call(b, 1, 3600)).toBe(true);
  });

  it("opens a new window after it elapses", async () => {
    const key = `test:${randomUUID()}`;
    // Align to the start of a 1-second window so the test can't straddle a boundary.
    await new Promise((r) => setTimeout(r, 1000 - (Date.now() % 1000) + 50));
    expect(await call(key, 1, 1)).toBe(true);
    expect(await call(key, 1, 1)).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await call(key, 1, 1)).toBe(true);
  });

  it("rejects nonsensical limits", async () => {
    await expect(call("test:bad", 0, 60)).rejects.toMatchObject({ code: "P0001" });
  });
});

describe("match_faqs", () => {
  let alice: TestUser;
  let bob: TestUser;
  let aliceBot: string;
  let bobBot: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    [alice, bob] = await Promise.all([createUser(), createUser()]);
    [aliceBot, bobBot] = [(await createBot(alice)).id, (await createBot(bob)).id];
    const admin = adminClient();
    const rows = [
      { key: "shipping", bot_id: aliceBot, axis: 0, q: "How long is shipping?", a: "Two days." },
      { key: "returns", bot_id: aliceBot, axis: 1, q: "Can I return shoes?", a: "Within 14 days." },
      { key: "sizes", bot_id: aliceBot, axis: 2, q: "Size guide", a: "See our sizing chart." },
      { key: "pending", bot_id: aliceBot, axis: 3, q: "Gift wrapping", a: "Yes, for free." },
      {
        key: "bob",
        bot_id: bobBot,
        axis: 0,
        q: "How long is shipping?",
        a: "Bob ships in a week.",
      },
    ];
    for (const r of rows) {
      const ready = r.key !== "pending";
      const { data, error } = await admin
        .from("faqs")
        .insert({ bot_id: r.bot_id, question: r.q, answer: r.a })
        .select("id")
        .single();
      if (error) throw error;
      ids[r.key] = data.id;
      if (ready) {
        await admin
          .from("faqs")
          .update({ embedding: axisVector(r.axis), embedding_status: "ready" })
          .eq("id", data.id);
      }
    }
  });

  const match = (
    client = adminClient(),
    args: { bot: string; axis: number; text?: string; hybrid?: boolean; k?: number },
  ) =>
    client.rpc("match_faqs", {
      p_bot_id: args.bot,
      p_query_embedding: axisVector(args.axis),
      p_query_text: args.text ?? "",
      p_k: args.k ?? 5,
      p_hybrid: args.hybrid ?? false,
    });

  it("ranks by cosine similarity within one bot only", async () => {
    const { data, error } = await match(undefined, { bot: aliceBot, axis: 0 });
    expect(error).toBeNull();
    expect(data![0]).toMatchObject({ id: ids.shipping, vector_rank: 1 });
    expect(data![0]!.similarity).toBeCloseTo(1, 5);
    const returned = data!.map((r) => r.id);
    expect(returned).not.toContain(ids.bob);
    // Not yet embedded FAQs are not vector candidates.
    expect(returned).not.toContain(ids.pending);
  });

  it("fuses full-text hits in hybrid mode", async () => {
    const { data } = await match(undefined, {
      bot: aliceBot,
      axis: 0,
      text: "gift wrapping",
      hybrid: true,
    });
    const pending = data!.find((r) => r.id === ids.pending);
    expect(pending).toMatchObject({ text_rank: 1, vector_rank: null, similarity: null });
    expect(data![0]!.rrf_score).toBeGreaterThan(0);
  });

  it("treats query text as words, never as tsquery syntax", async () => {
    const { error } = await match(undefined, {
      bot: aliceBot,
      axis: 0,
      text: "'); drop table faqs; -- & | ! :* (",
      hybrid: true,
    });
    expect(error).toBeNull();
  });

  it("is limited by RLS when an owner calls it for someone else's bot", async () => {
    const own = await match(alice.client, { bot: aliceBot, axis: 1 });
    expect(own.data![0]!.id).toBe(ids.returns);
    const foreign = await match(alice.client, { bot: bobBot, axis: 0 });
    expect(foreign.data).toEqual([]);
  });

  it("caps k", async () => {
    const { data } = await match(undefined, { bot: aliceBot, axis: 0, k: 1 });
    expect(data).toHaveLength(1);
  });
});

describe("purge_expired_data", () => {
  it("removes expired sandboxes and old demo/sandbox conversations only", async () => {
    const admin = adminClient();
    const [expired, live, demoOwner, regular] = await Promise.all([
      createUser(),
      createUser(),
      createUser(),
      createUser(),
    ]);
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await admin
      .from("profiles")
      .update({ is_sandbox: true, sandbox_expires_at: past })
      .eq("id", expired.id);
    await admin
      .from("profiles")
      .update({ is_sandbox: true, sandbox_expires_at: future })
      .eq("id", live.id);

    const demoBot = (await createBot(demoOwner)).id;
    await admin.from("bots").update({ is_demo: true }).eq("id", demoBot);
    const regularBot = (await createBot(regular)).id;

    const oldDemo = (await startConversation(demoBot)).conversation_id!;
    const newDemo = (await startConversation(demoBot)).conversation_id!;
    const oldRegular = (await startConversation(regularBot)).conversation_id!;
    const longAgo = new Date(Date.now() - 31 * 86_400_000).toISOString();
    await admin
      .from("conversations")
      .update({ created_at: longAgo })
      .in("id", [oldDemo, oldRegular]);

    const { error } = await admin.rpc("purge_expired_data");
    expect(error).toBeNull();

    const profiles = await admin.from("profiles").select("id").in("id", [expired.id, live.id]);
    expect(profiles.data?.map((p) => p.id)).toEqual([live.id]);
    const authUser = await admin.auth.admin.getUserById(expired.id);
    expect(authUser.data.user).toBeNull();

    const remaining = await admin
      .from("conversations")
      .select("id")
      .in("id", [oldDemo, newDemo, oldRegular]);
    expect(remaining.data?.map((c) => c.id).sort()).toEqual([newDemo, oldRegular].sort());
  });
});
