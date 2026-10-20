import { beforeAll, describe, expect, it } from "vitest";

import { normalizeForSearch } from "@/lib/faqs/text";

import { adminClient, axisVector, createBot, createUser, type TestUser } from "./helpers";

describe("search_normalize", () => {
  const samples = [
    "Šta je rok za povraćaj?",
    "ČAŠA  ćevap\tžuto",
    "Đorđe i đak",
    "  How long\n does   SHIPPING take? ",
    "Kožne cipele — održavanje",
  ];

  // Punctuation may differ (unaccent turns "—" into "-"); search only ever sees words.
  const words = (text: string | null) => text?.match(/[\p{L}\p{N}]+/gu) ?? [];

  it("produces the same words as normalizeForSearch() in the app", async () => {
    const admin = adminClient();
    for (const text of samples) {
      const { data, error } = await admin.rpc("search_normalize", { p_text: text });
      expect(error).toBeNull();
      expect(words(data)).toEqual(words(normalizeForSearch(text)));
    }
  });
});

describe("match_faqs (phase 3)", () => {
  let owner: TestUser;
  let botId: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    owner = await createUser();
    botId = (await createBot(owner)).id;
    const admin = adminClient();
    const rows = [
      {
        key: "returns",
        language: "sr",
        axis: 0,
        q: "Koji je rok za povraćaj robe?",
        a: "14 dana.",
      },
      { key: "delivery", language: "sr", axis: 1, q: "Koliko traje dostava?", a: "1–3 dana." },
      { key: "gift", language: "en", axis: 2, q: "Do you offer gift wrapping?", a: "Yes." },
      {
        key: "shipping",
        language: "en",
        axis: 3,
        q: "How long does shipping take?",
        a: "Gift orders too.",
      },
    ];
    for (const r of rows) {
      const { data, error } = await owner.client
        .from("faqs")
        .insert({ bot_id: botId, question: r.q, answer: r.a, language: r.language })
        .select("id")
        .single();
      if (error) throw error;
      ids[r.key] = data.id;
      const update = await admin
        .from("faqs")
        .update({ embedding: axisVector(r.axis), embedding_status: "ready" })
        .eq("id", data.id);
      if (update.error) throw update.error;
    }
  });

  const match = (args: {
    axis?: number | null;
    text: string;
    hybrid?: boolean;
    language?: string;
  }) =>
    owner.client.rpc("match_faqs", {
      p_bot_id: botId,
      // Text-only fallback passes no embedding at all.
      p_query_embedding: (args.axis === null ? null : axisVector(args.axis ?? 0)) as string,
      p_query_text: args.text,
      p_k: 5,
      p_hybrid: args.hybrid ?? false,
      p_language: args.language,
    });

  it("filters by language", async () => {
    const { data, error } = await match({ axis: 2, text: "", language: "sr" });
    expect(error).toBeNull();
    const returned = data!.map((r) => r.id);
    expect(returned).toEqual(expect.arrayContaining([ids.returns, ids.delivery]));
    expect(returned).not.toContain(ids.gift);
    expect(returned).not.toContain(ids.shipping);
  });

  it("matches Serbian text typed without diacritics", async () => {
    const { data } = await match({ axis: null, text: "sta je rok za povracaj", language: "sr" });
    expect(data![0]).toMatchObject({ id: ids.returns, text_rank: 1, similarity: null });
  });

  it("matches other word endings through the prefix rule", async () => {
    // "povraćaja" → "povrac:*" meets "povraćaj"; "dostavu" (7 letters) → "dosta:*".
    const { data } = await match({ axis: null, text: "povraćaja dostavu", language: "sr" });
    const returned = data!.map((r) => r.id);
    expect(returned).toEqual(expect.arrayContaining([ids.returns, ids.delivery]));
  });

  it("ignores stop words, so a question made of them matches nothing on text", async () => {
    const { data } = await match({ axis: null, text: "what is the how do you", language: "en" });
    expect(data).toEqual([]);
  });

  it("reports the share of query keywords found in each FAQ's question", async () => {
    const { data } = await match({ axis: 2, text: "gift wrapping price", language: "en" });
    const gift = data!.find((r) => r.id === ids.gift)!;
    expect(gift.keyword_overlap).toBeCloseTo(2 / 3, 5);
    // "gift" is only in the shipping FAQ's ANSWER, which doesn't count as overlap.
    const shipping = data!.find((r) => r.id === ids.shipping)!;
    expect(shipping.keyword_overlap).toBe(0);
  });

  it("returns null overlap when the query has no content words", async () => {
    const { data } = await match({ axis: 2, text: "how is it", language: "en" });
    expect(data![0]!.keyword_overlap).toBeNull();
  });

  it("orders by similarity unless hybrid, and fuses text in hybrid mode", async () => {
    const vector = await match({ axis: 3, text: "gift wrapping", language: "en" });
    expect(vector.data![0]!.id).toBe(ids.shipping);

    const hybrid = await match({ axis: 3, text: "gift wrapping", language: "en", hybrid: true });
    // Gift ranks first on text and second on vector; shipping ranks first on vector only
    // and second on text (its answer mentions gifts): a tie broken by id, both present.
    expect(hybrid.data!.map((r) => r.id)).toEqual(expect.arrayContaining([ids.gift, ids.shipping]));
    expect(hybrid.data!.every((r) => r.rrf_score! > 0)).toBe(true);
  });

  it("is confined to the caller's bots by RLS", async () => {
    const stranger = await createUser();
    const { data, error } = await stranger.client.rpc("match_faqs", {
      p_bot_id: botId,
      p_query_embedding: axisVector(0),
      p_query_text: "povracaj",
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("faqs full-text column", () => {
  it("weights the question above the answer", async () => {
    const owner = await createUser();
    const botId = (await createBot(owner)).id;
    const { data, error } = await owner.client
      .from("faqs")
      .insert({ bot_id: botId, question: "Povraćaj robe", answer: "Dostava besplatna" })
      .select("fts")
      .single();
    expect(error).toBeNull();
    expect(String(data!.fts)).toContain("'povracaj':1A");
    expect(String(data!.fts)).toContain("'dostava':3B");
  });
});
