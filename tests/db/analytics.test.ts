import { beforeAll, describe, expect, it } from "vitest";

import { seedAnalytics } from "@/lib/demo/analytics-seed";

import { adminClient, createBot, createUser, startConversation, type TestUser } from "./helpers";

const db = () => adminClient();

type Summary = {
  days: number;
  totals: {
    conversations: number;
    resolvedByBot: number;
    handedOff: number;
    avgFirstResponseMs: number | null;
    ratingsUp: number;
    ratingsDown: number;
  };
  daily: { day: string; byBot: number; handedOff: number }[];
};

describe("analytics_summary", () => {
  let owner: TestUser;
  let stranger: TestUser;
  let botId: string;

  beforeAll(async () => {
    owner = await createUser();
    stranger = await createUser();
    botId = (await createBot(owner)).id;
    await seedAnalytics(db(), botId, { days: 30, seed: 1 });
  });

  it("matches the rows it summarizes, with one entry per day", async () => {
    const { data, error } = await owner.client.rpc("analytics_summary", {
      p_bot_id: botId,
      p_days: 30,
    });
    expect(error).toBeNull();
    const summary = data as Summary;

    const { data: rows } = await db()
      .from("conversations")
      .select("handed_off_at, rating, first_response_ms")
      .eq("bot_id", botId);
    const handed = rows!.filter((r) => r.handed_off_at).length;
    expect(summary.totals).toMatchObject({
      conversations: rows!.length,
      handedOff: handed,
      resolvedByBot: rows!.length - handed,
      ratingsUp: rows!.filter((r) => r.rating === "up").length,
      ratingsDown: rows!.filter((r) => r.rating === "down").length,
    });
    expect(summary.totals.avgFirstResponseMs).toBeGreaterThan(0);
    expect(summary.daily).toHaveLength(30);
    const sum = summary.daily.reduce((n, d) => n + d.byBot + d.handedOff, 0);
    expect(sum).toBe(rows!.length);
    // Consecutive days, oldest first, ending today (UTC).
    expect(summary.daily.at(-1)!.day).toBe(new Date().toISOString().slice(0, 10));
  });

  it("all bots (null) equals the one bot here; a shorter range counts fewer", async () => {
    const all = (await owner.client.rpc("analytics_summary", { p_days: 30 })).data as Summary;
    const week = (await owner.client.rpc("analytics_summary", { p_bot_id: botId, p_days: 7 }))
      .data as Summary;
    const month = (await owner.client.rpc("analytics_summary", { p_bot_id: botId, p_days: 30 }))
      .data as Summary;
    expect(all.totals.conversations).toBe(month.totals.conversations);
    expect(week.daily).toHaveLength(7);
    expect(week.totals.conversations).toBeLessThan(month.totals.conversations);
  });

  it("another owner sees nothing of this bot (RLS)", async () => {
    const { data } = await stranger.client.rpc("analytics_summary", {
      p_bot_id: botId,
      p_days: 30,
    });
    const summary = data as Summary;
    expect(summary.totals).toMatchObject({ conversations: 0, handedOff: 0, ratingsUp: 0 });
    expect(summary.totals.avgFirstResponseMs).toBeNull();
    expect(summary.daily.every((d) => d.byBot === 0 && d.handedOff === 0)).toBe(true);
  });

  it("is not callable without signing in", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const { inject } = await import("vitest");
    const { url, publishableKey } = inject("supabase");
    const anon = createClient(url, publishableKey, { auth: { persistSession: false } });
    const { error } = await anon.rpc("analytics_summary", { p_days: 7 });
    expect(error).not.toBeNull();
  });
});

describe("unknown-question suggestions", () => {
  let owner: TestUser;
  let botId: string;

  beforeAll(async () => {
    owner = await createUser();
    botId = (await createBot(owner)).id;
  });

  async function unknownChat(question: string) {
    const started = await startConversation(botId);
    const conversationId = started.conversation_id!;
    const { error } = await db().rpc("record_bot_reply", {
      p_conversation_id: conversationId,
      p_bot_id: botId,
      p_content: "I'm not sure.",
      p_source_faq_ids: [],
      p_meta: {},
      p_outcome: "unknown",
      p_question: question,
      p_language: "en",
      p_first_response_ms: 100,
    });
    if (error) throw error;
    return conversationId;
  }

  const questionOf = async (conversationId: string) =>
    (
      await db()
        .from("unknown_questions")
        .select("id, status, suggested_answer, suggestion_source")
        .eq("conversation_id", conversationId)
        .single()
    ).data!;

  it("the owner's first reply becomes the draft; later replies don't replace it", async () => {
    const conversationId = await unknownChat("Do you have size 52?");
    expect(await questionOf(conversationId)).toMatchObject({ suggestion_source: "none" });

    for (const content of ["Size 52 arrives on Monday.", "Anything else?"]) {
      const { error } = await owner.client.rpc("owner_reply", {
        p_conversation_id: conversationId,
        p_content: content,
        p_reply_email: null,
      });
      expect(error).toBeNull();
    }
    expect(await questionOf(conversationId)).toMatchObject({
      suggested_answer: "Size 52 arrives on Monday.",
      suggestion_source: "human_reply",
    });
  });

  it("owners can mark a question added or dismissed, but can't write its suggestion", async () => {
    const conversationId = await unknownChat("Gift wrapping?");
    const { id } = await questionOf(conversationId);

    const changed = await owner.client
      .from("unknown_questions")
      .update({ status: "dismissed" })
      .eq("id", id)
      .select("status");
    expect(changed.data).toEqual([{ status: "dismissed" }]);

    const forged = await owner.client
      .from("unknown_questions")
      .update({ suggested_answer: "forged" })
      .eq("id", id);
    expect(forged.error).not.toBeNull();

    const stranger = await createUser();
    const foreign = await stranger.client
      .from("unknown_questions")
      .update({ status: "added" })
      .eq("id", id)
      .select("id");
    expect(foreign.data).toEqual([]);
    expect(await questionOf(conversationId)).toMatchObject({ status: "dismissed" });
  });
});
