import { beforeAll, describe, expect, it } from "vitest";

import { hashIp } from "@/lib/security/ip";
import { handleConfig, handleEnd, handlePoll, handleRate } from "@/lib/widget/handlers";
import { handleMessage, type MessageDeps } from "@/lib/widget/message";
import { MAX_VISITOR_MESSAGES, WIDGET_RATE_LIMITS } from "@/lib/widget/limits";

import { adminClient, axisVector, createBot, createUser, type TestUser } from "./helpers";

// The embed Edge Function isn't part of the test stack: queries get fixed unit vectors,
// so similarity is exact (same axis = 1, different axis = 0).
type Embed = MessageDeps["embed"];
const axis = (i: number) => JSON.parse(axisVector(i)) as number[];
const embedAs =
  (i: number | null): Embed =>
  async () =>
    i === null ? null : axis(i);

const SHOP = "https://shop.example";
const db = () => adminClient();

function deps(embed: Embed = embedAs(0)): MessageDeps {
  return { db: db(), embed, sleep: async () => {}, now: () => performance.now() };
}

// Test-side view of the protocol: loose on purpose, assertions pin the shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
type Sent = {
  status: number;
  headers: Headers;
  events: { event: string; data: Loose }[];
  json?: Loose;
};

async function send(
  bot: string,
  text: string,
  opts: { token?: string; origin?: string; ip?: string; embed?: Embed; locale?: string } = {},
): Promise<Sent> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers["X-Relay-Token"] = opts.token;
  if (opts.origin) headers.Origin = opts.origin;
  headers["X-Forwarded-For"] = opts.ip ?? `10.${Math.floor(Math.random() * 250)}.0.1`;
  const response = await handleMessage(
    new Request("https://relay.test/api/widget/message", {
      method: "POST",
      headers,
      body: JSON.stringify({ bot, text, locale: opts.locale }),
    }),
    deps(opts.embed),
  );
  const body = await response.text();
  if (!response.headers.get("content-type")?.startsWith("text/event-stream")) {
    return {
      status: response.status,
      headers: response.headers,
      events: [],
      json: JSON.parse(body),
    };
  }
  const events = body
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => {
      const [eventLine, dataLine] = frame.split("\n");
      return { event: eventLine!.slice(7), data: JSON.parse(dataLine!.slice(6)) };
    });
  return { status: response.status, headers: response.headers, events };
}

const tokenOf = (sent: Sent) => sent.events[0]!.data.token as string;
const replyText = (sent: Sent) =>
  sent.events
    .filter((e) => e.event === "delta")
    .map((e) => e.data.text)
    .join("");

async function setupBot(owner: TestUser) {
  const bot = await createBot(owner, "Widget bot");
  await owner.client
    .from("bots")
    .update({ allowed_origins: [SHOP] })
    .eq("id", bot.id);
  const faqs = [
    { axis: 0, question: "How long does shipping take?", answer: "1–3 working days." },
    { axis: 1, question: "Can I return shoes?", answer: "Yes, within 14 days." },
  ];
  for (const f of faqs) {
    const { data, error } = await owner.client
      .from("faqs")
      .insert({ bot_id: bot.id, question: f.question, answer: f.answer, language: "en" })
      .select("id")
      .single();
    if (error) throw error;
    await db()
      .from("faqs")
      .update({ embedding: axisVector(f.axis), embedding_status: "ready" })
      .eq("id", data.id);
  }
  return { id: bot.id as string, key: bot.public_key as string };
}

async function conversationOf(token: string) {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(token).digest("hex");
  const { data } = await db().from("conversations").select("*").eq("token_hash", hash).single();
  return data!;
}

describe("POST /api/widget/message", () => {
  let owner: TestUser;
  let bot: { id: string; key: string };

  beforeAll(async () => {
    owner = await createUser();
    bot = await setupBot(owner);
  });

  it("streams an answer with its source and issues the token once", async () => {
    const first = await send(bot.key, "How long does shipping take?", { origin: SHOP });
    expect(first.status).toBe(200);
    expect(first.headers.get("access-control-allow-origin")).toBe(SHOP);
    expect(first.headers.get("vary")).toContain("Origin");
    expect(first.headers.get("cache-control")).toContain("no-store");

    const names = first.events.map((e) => e.event);
    expect(names[0]).toBe("meta");
    expect(names.slice(-2)).toEqual(["sources", "done"]);
    expect(first.events[0]!.data).toMatchObject({ mode: "sample", language: "en" });
    expect(tokenOf(first)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(replyText(first)).toBe("1–3 working days.");
    expect(first.events.at(-2)!.data.faqs[0].question).toBe("How long does shipping take?");
    expect(first.events.at(-1)!.data).toEqual({
      outcome: "answered",
      offerHuman: false,
      suggestions: [],
      remainingMessages: MAX_VISITOR_MESSAGES - 1,
    });

    // Only the hash is stored; both messages and the source are saved.
    const conversation = await conversationOf(tokenOf(first));
    expect(JSON.stringify(conversation)).not.toContain(tokenOf(first));
    expect(conversation).toMatchObject({ visitor_message_count: 1, unknown_streak: 0 });
    expect(conversation.first_response_ms).toBeGreaterThanOrEqual(0);
    const { data: messages } = await db()
      .from("messages")
      .select("role, content, source_faq_ids")
      .eq("conversation_id", conversation.id)
      .order("created_at");
    expect(messages!.map((m) => m.role)).toEqual(["visitor", "bot"]);
    expect(messages![1]!.source_faq_ids).toHaveLength(1);

    // The same conversation continues with the token; no new token is issued.
    const second = await send(bot.key, "Can I return shoes?", {
      token: tokenOf(first),
      embed: embedAs(1),
    });
    expect(second.events[0]!.data.token).toBeUndefined();
    expect(replyText(second)).toBe("Yes, within 14 days.");
    expect((await conversationOf(tokenOf(first))).visitor_message_count).toBe(2);
  });

  it("says it doesn't know, logs the question, and counts the streak", async () => {
    const first = await send(bot.key, "Do you sell kids clothing?", { embed: embedAs(9) });
    const token = tokenOf(first);
    expect(first.events.map((e) => e.event)).not.toContain("sources");
    expect(first.events.at(-1)!.data).toMatchObject({ outcome: "unknown", offerHuman: true });
    expect(replyText(first)).toMatch(/^I'm not sure/);

    await send(bot.key, "And for babies?", { token, embed: embedAs(9) });
    let conversation = await conversationOf(token);
    expect(conversation.unknown_streak).toBe(2);
    const { data: unknowns } = await db()
      .from("unknown_questions")
      .select("question, language, status")
      .eq("conversation_id", conversation.id)
      .order("created_at");
    expect(unknowns).toEqual([
      { question: "Do you sell kids clothing?", language: "en", status: "open" },
      { question: "And for babies?", language: "en", status: "open" },
    ]);

    // An answer resets the streak.
    await send(bot.key, "How long does shipping take?", { token });
    conversation = await conversationOf(token);
    expect(conversation.unknown_streak).toBe(0);
  });

  it("replies in Serbian when the visitor writes Serbian", async () => {
    const sent = await send(bot.key, "Šta je sa dečijom odećom?", { embed: embedAs(9) });
    expect(sent.events[0]!.data.language).toBe("sr");
    expect(replyText(sent)).toMatch(/^Nisam siguran/);
  });

  it("degrades without logging an unknown question when embedding is down", async () => {
    const sent = await send(bot.key, "How long does shipping take?", { embed: embedAs(null) });
    expect(sent.events.at(-1)!.data).toMatchObject({ outcome: "degraded", offerHuman: true });
    const conversation = await conversationOf(tokenOf(sent));
    expect(conversation.unknown_streak).toBe(0);
    const { count } = await db()
      .from("unknown_questions")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversation.id);
    expect(count).toBe(0);
  });

  it("refuses foreign origins without CORS headers, and accepts the app's own", async () => {
    const denied = await send(bot.key, "hi", { origin: "https://evil.example" });
    expect(denied.status).toBe(403);
    expect(denied.json).toEqual({ error: "origin_not_allowed" });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    expect(denied.headers.get("vary")).toBe("Origin");

    const app = await send(bot.key, "How long does shipping take?", {
      origin: "https://relay.test",
    });
    expect(app.status).toBe(200);
    expect(app.headers.get("access-control-allow-origin")).toBe("https://relay.test");
  });

  it.each<[string, { bot?: string; text?: string }, number, string]>([
    ["empty text", { text: "   " }, 400, "empty_message"],
    ["too long", { text: "x".repeat(501) }, 400, "message_too_long"],
    ["unknown bot", { bot: "unknownbotkey00000" }, 404, "bot_not_found"],
  ])("rejects %s cleanly", async (_label, override, status, error) => {
    const sent = await send(override.bot ?? bot.key, override.text ?? "hi");
    expect(sent.status).toBe(status);
    expect(sent.json).toEqual({ error });
  });

  it("rejects a malformed body", async () => {
    const response = await handleMessage(
      new Request("https://relay.test/api/widget/message", { method: "POST", body: "{nope" }),
      deps(),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad_request" });
  });

  it("rejects unknown tokens and tokens of another bot's conversation", async () => {
    expect((await send(bot.key, "hi", { token: "A".repeat(22) })).status).toBe(401);
    expect((await send(bot.key, "hi", { token: "not-a-token" })).status).toBe(401);

    const other = await setupBot(await createUser());
    const theirs = await send(other.key, "How long does shipping take?");
    const reused = await send(bot.key, "hi", { token: tokenOf(theirs) });
    expect(reused.status).toBe(401);
    expect(reused.json).toEqual({ error: "invalid_token" });
  });

  it("caps visitor messages per conversation", async () => {
    const first = await send(bot.key, "How long does shipping take?");
    const conversation = await conversationOf(tokenOf(first));
    await db()
      .from("conversations")
      .update({ visitor_message_count: MAX_VISITOR_MESSAGES })
      .eq("id", conversation.id);
    const capped = await send(bot.key, "One more?", { token: tokenOf(first) });
    expect(capped.status).toBe(429);
    expect(capped.json).toEqual({ error: "message_cap_reached" });
  });

  it("rate-limits per visitor IP and bot", async () => {
    const ip = "10.99.0.7";
    const rule = WIDGET_RATE_LIMITS.message;
    const key = `${rule.name}:${bot.id}:${hashIp(ip, process.env.IP_HASH_SALT!)}`;
    for (let i = 0; i < rule.limit; i++) {
      await db().rpc("check_rate_limit", {
        p_key: key,
        p_limit: rule.limit,
        p_window_seconds: rule.windowSeconds,
      });
    }
    const limited = await send(bot.key, "hi", { ip });
    expect(limited.status).toBe(429);
    expect(limited.json).toEqual({ error: "rate_limited" });
    expect(limited.headers.get("retry-after")).toBe("60");
    // Another visitor is unaffected.
    expect((await send(bot.key, "How long does shipping take?", { ip: "10.99.0.8" })).status).toBe(
      200,
    );
  });

  it("refuses new conversations over the monthly quota, but lets open ones continue", async () => {
    const quotaOwner = await createUser();
    const quotaBot = await setupBot(quotaOwner);
    const open = await send(quotaBot.key, "How long does shipping take?");

    const period = new Date().toISOString().slice(0, 7);
    await db()
      .from("usage_counters")
      .update({ conversations_started: 50 })
      .eq("profile_id", quotaOwner.id)
      .eq("period", period);

    const refused = await send(quotaBot.key, "Hello?");
    expect(refused.status).toBe(503);
    expect(refused.json).toEqual({ error: "quota_exceeded" });

    const continued = await send(quotaBot.key, "Can I return shoes?", {
      token: tokenOf(open),
      embed: embedAs(1),
    });
    expect(continued.status).toBe(200);
  });

  it("refuses everything for a paused bot", async () => {
    const pausedOwner = await createUser();
    const paused = await setupBot(pausedOwner);
    await pausedOwner.client.from("bots").update({ active: false }).eq("id", paused.id);
    const sent = await send(paused.key, "hi");
    expect(sent.status).toBe(503);
    expect(sent.json).toEqual({ error: "bot_inactive" });
  });
});

describe("add_visitor_message", () => {
  it("never lets parallel messages exceed the per-conversation cap", async () => {
    const owner = await createUser();
    const bot = await setupBot(owner);
    const first = await send(bot.key, "How long does shipping take?");
    const conversation = await conversationOf(tokenOf(first));
    await db()
      .from("conversations")
      .update({ visitor_message_count: MAX_VISITOR_MESSAGES - 5 })
      .eq("id", conversation.id);

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        db().rpc("add_visitor_message", {
          p_conversation_id: conversation.id,
          p_bot_id: bot.id,
          p_content: `message ${i}`,
          p_language: "en",
          p_max_messages: MAX_VISITOR_MESSAGES,
        }),
      ),
    );
    const statuses = results.map((r) => (r.data as { status: string }).status);
    expect(statuses.filter((s) => s === "ok")).toHaveLength(5);
    expect(statuses.filter((s) => s === "cap_reached")).toHaveLength(7);
    expect((await conversationOf(tokenOf(first))).visitor_message_count).toBe(MAX_VISITOR_MESSAGES);
  });

  it("is callable by the service role only", async () => {
    const owner = await createUser();
    const { error } = await owner.client.rpc("add_visitor_message", {
      p_conversation_id: crypto.randomUUID(),
      p_bot_id: crypto.randomUUID(),
      p_content: "x",
      p_language: "en",
      p_max_messages: 20,
    });
    expect(error?.code).toBe("42501");
  });
});

describe("config, poll, rate, end", () => {
  let owner: TestUser;
  let bot: { id: string; key: string };

  beforeAll(async () => {
    owner = await createUser();
    bot = await setupBot(owner);
  });

  const get = (path: string, headers: Record<string, string> = {}) =>
    new Request(`https://relay.test/api/widget/${path}`, { headers });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`https://relay.test/api/widget/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  it("config returns public settings only, CORS-scoped", async () => {
    const response = await handleConfig(get(`config?bot=${bot.key}`, { Origin: SHOP }), db());
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(SHOP);
    const config = await response.json();
    expect(config).toMatchObject({
      name: "Widget bot",
      position: "right",
      available: true,
      mode: "sample",
      defaultLanguage: "en",
    });
    expect(config.foreground).toMatch(/^#[0-9a-f]{6}$/i);
    for (const secret of ["id", "owner_id", "ownerId", "allowedOrigins", "realtime_channel"]) {
      expect(config).not.toHaveProperty(secret);
    }

    const denied = await handleConfig(
      get(`config?bot=${bot.key}`, { Origin: "https://evil.example" }),
      db(),
    );
    expect(denied.status).toBe(403);
  });

  it("config reports unavailable once the monthly quota is used", async () => {
    const quotaOwner = await createUser();
    const quotaBot = await setupBot(quotaOwner);
    await db()
      .from("usage_counters")
      .insert({
        profile_id: quotaOwner.id,
        period: new Date().toISOString().slice(0, 7),
        conversations_started: 50,
      });
    const config = await (await handleConfig(get(`config?bot=${quotaBot.key}`), db())).json();
    expect(config.available).toBe(false);
  });

  it("poll returns only this conversation's new human and system messages", async () => {
    const mine = await send(bot.key, "How long does shipping take?");
    const theirs = await send(bot.key, "How long does shipping take?");
    const [a, b] = [await conversationOf(tokenOf(mine)), await conversationOf(tokenOf(theirs))];

    const insert = (conversationId: string, role: string, content: string, at: string) =>
      db().from("messages").insert({
        conversation_id: conversationId,
        bot_id: bot.id,
        role,
        content,
        created_at: at,
      });
    const now = Date.now();
    const iso = (offset: number) => new Date(now + offset).toISOString();
    await insert(a.id, "human", "Hi, Mila here.", iso(1000));
    await insert(a.id, "system", "Mila joined the chat.", iso(2000));
    await insert(b.id, "human", "Someone else's reply", iso(1500));

    const poll = (since?: string) =>
      handlePoll(
        get(`poll?bot=${bot.key}${since ? `&since=${encodeURIComponent(since)}` : ""}`, {
          "X-Relay-Token": tokenOf(mine),
        }),
        db(),
      ).then((r) => r.json());

    const all = await poll();
    expect(all.status).toBe("bot");
    expect(all.messages.map((m: { text: string }) => m.text)).toEqual([
      "Hi, Mila here.",
      "Mila joined the chat.",
    ]);
    const newer = await poll(iso(1000));
    expect(newer.messages.map((m: { role: string }) => m.role)).toEqual(["system"]);

    const badSince = await handlePoll(
      get(`poll?bot=${bot.key}&since=yesterday`, { "X-Relay-Token": tokenOf(mine) }),
      db(),
    );
    expect(badSince.status).toBe(400);
    const noToken = await handlePoll(get(`poll?bot=${bot.key}`), db());
    expect(noToken.status).toBe(401);
  });

  it("rate stores 👍/👎 and end resolves the chat for good", async () => {
    const sent = await send(bot.key, "How long does shipping take?");
    const token = tokenOf(sent);

    const rated = await handleRate(
      post("rate", { bot: bot.key, rating: "down" }, { "X-Relay-Token": token }),
      db(),
    );
    expect(await rated.json()).toEqual({ rating: "down" });
    expect(
      (
        await handleRate(
          post("rate", { bot: bot.key, rating: "meh" }, { "X-Relay-Token": token }),
          db(),
        )
      ).status,
    ).toBe(400);

    const ended = await handleEnd(post("end", { bot: bot.key }, { "X-Relay-Token": token }), db());
    expect(await ended.json()).toEqual({ status: "resolved" });
    // Idempotent.
    expect(
      (await handleEnd(post("end", { bot: bot.key }, { "X-Relay-Token": token }), db())).status,
    ).toBe(200);

    const conversation = await conversationOf(token);
    expect(conversation).toMatchObject({
      rating: "down",
      status: "resolved",
      resolved_by: "visitor",
    });

    const after = await send(bot.key, "Still there?", { token });
    expect(after.status).toBe(409);
    expect(after.json).toEqual({ error: "conversation_closed" });
  });
});
