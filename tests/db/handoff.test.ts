import { beforeAll, describe, expect, it } from "vitest";

import { handleHandoff, handlePoll } from "@/lib/widget/handlers";

import { createUser, type TestUser } from "./helpers";
import { conversationOf, db, embedAs, send, setupBot, SHOP, tokenOf } from "./widget-helpers";

const escalation = {
  bot: { id: "x", name: "Shop" },
  owner: { notificationEmail: "owner@relay.test", language: "en" },
  data: { lastMessages: [], inboxUrl: "https://relay.test/dashboard/inbox/x" },
};
const replyEmail = {
  bot: { id: "x", name: "Shop" },
  owner: { notificationEmail: "owner@relay.test", language: "en" },
  data: { replyText: "Hello", shopName: "Shop", language: "en" },
};

const post = (path: string, body: unknown, token?: string) =>
  new Request(`https://relay.test/api/widget/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: SHOP,
      ...(token ? { "X-Relay-Token": token } : {}),
    },
    body: JSON.stringify(body),
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- assertions pin the shape
type Payload = any;

async function outboxOf(
  conversationId: string,
): Promise<{ type: string; status: string; payload: Payload; owner_id: string | null }[]> {
  const { data } = await db()
    .from("n8n_outbox")
    .select("type, status, payload, owner_id")
    .filter("payload->data->>conversationId", "eq", conversationId)
    .order("created_at");
  return data ?? [];
}

describe("handoff", () => {
  let owner: TestUser;
  let bot: { id: string; key: string };

  beforeAll(async () => {
    owner = await createUser();
    bot = await setupBot(owner);
  });

  it("request_handoff: bot → waiting_human once, with a system message and one escalation", async () => {
    const token = tokenOf(await send(bot.key, "How long does shipping take?"));
    const conversation = await conversationOf(token);
    const call = (email: string | null) =>
      db().rpc("request_handoff", {
        p_conversation_id: conversation.id,
        p_bot_id: bot.id,
        p_reason: "requested",
        // Generated RPC types don't mark arguments nullable; SQL accepts null.
        p_email: email as string,
        p_system_message: "A person will reply.",
        p_escalation: escalation,
      });

    expect((await call(null)).data).toMatchObject({
      status: "handed_off",
      conversation_status: "waiting_human",
    });
    const after = await conversationOf(token);
    expect(after).toMatchObject({ status: "waiting_human", owner_unread: true });
    expect(after.handed_off_at).not.toBeNull();

    // A second call (the email arriving later) only stores the email.
    expect((await call(" Visitor@Example.com ")).data).toMatchObject({ status: "already" });
    expect((await conversationOf(token)).visitor_email).toBe("visitor@example.com");

    const outbox = await outboxOf(conversation.id);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      type: "escalation",
      status: "pending",
      owner_id: owner.id,
      payload: {
        bot: escalation.bot,
        data: { conversationId: conversation.id, reason: "requested" },
      },
    });

    const { data: system } = await db()
      .from("messages")
      .select("role, content, meta")
      .eq("conversation_id", conversation.id)
      .eq("role", "system");
    expect(system).toEqual([
      {
        role: "system",
        content: "A person will reply.",
        meta: { kind: "handoff", reason: "requested" },
      },
    ]);
  });

  it("request_handoff refuses resolved chats, bad reasons and non-service callers", async () => {
    const token = tokenOf(await send(bot.key, "How long does shipping take?"));
    const conversation = await conversationOf(token);
    const args = {
      p_conversation_id: conversation.id,
      p_bot_id: bot.id,
      p_email: null as unknown as string,
      p_system_message: "x",
      p_escalation: escalation,
    };
    expect((await db().rpc("request_handoff", { ...args, p_reason: "boredom" })).error?.code).toBe(
      "22023",
    );
    expect(
      (await owner.client.rpc("request_handoff", { ...args, p_reason: "requested" })).error?.code,
    ).toBe("42501");

    await db().from("conversations").update({ status: "resolved" }).eq("id", conversation.id);
    expect(
      (await db().rpc("request_handoff", { ...args, p_reason: "requested" })).data,
    ).toMatchObject({ status: "closed" });
  });

  it("visitor messages after a handoff mark the chat unread for the owner", async () => {
    const token = tokenOf(await send(bot.key, "How long does shipping take?"));
    const conversation = await conversationOf(token);
    await db()
      .from("conversations")
      .update({ status: "human", owner_unread: false })
      .eq("id", conversation.id);
    const sent = await send(bot.key, "Any news?", { token });
    // The bot stays quiet while a person handles the chat.
    expect(sent.events.map((e) => e.event)).toEqual(["meta", "done"]);
    expect(sent.events[1]!.data.outcome).toBe("waiting");
    expect((await conversationOf(token)).owner_unread).toBe(true);
  });

  it("typing 'talk to a human' hands off without searching the FAQ", async () => {
    const sent = await send(bot.key, "Can I talk to a human please?", { origin: SHOP });
    expect(sent.events.map((e) => e.event)).toEqual(["meta", "handoff", "done"]);
    expect(sent.events[1]!.data).toMatchObject({ reason: "requested", status: "waiting_human" });
    expect(sent.events[1]!.data.message).toContain("will reply here");
    expect(sent.events[0]!.data.channel).toMatch(/^[0-9a-f]{32}$/);
    const conversation = await conversationOf(tokenOf(sent));
    expect(conversation.status).toBe("waiting_human");
    expect(await outboxOf(conversation.id)).toHaveLength(1);
  });

  it("two unknowns in a row hand off after the second reply", async () => {
    const first = await send(bot.key, "Do you sell kids clothing?", { embed: embedAs(9) });
    expect(first.events.map((e) => e.event)).not.toContain("handoff");
    const second = await send(bot.key, "And for babies?", {
      token: tokenOf(first),
      embed: embedAs(9),
    });
    const names = second.events.map((e) => e.event);
    expect(names.slice(-2)).toEqual(["handoff", "done"]);
    expect(second.events.at(-2)!.data.reason).toBe("unknown_twice");
    const outbox = await outboxOf((await conversationOf(tokenOf(first))).id);
    expect(outbox[0]!.payload.data.reason).toBe("unknown_twice");
    // The last messages travel with the escalation (≤ 6, role + text).
    expect(outbox[0]!.payload.data.lastMessages.length).toBeGreaterThan(0);
    expect(outbox[0]!.payload.data.lastMessages.length).toBeLessThanOrEqual(6);
  });

  it("POST /handoff validates the email and is idempotent", async () => {
    const token = tokenOf(await send(bot.key, "How long does shipping take?"));
    const bad = await handleHandoff(post("handoff", { bot: bot.key, email: "nope" }, token), db());
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "invalid_email" });

    const first = await handleHandoff(post("handoff", { bot: bot.key }, token), db());
    expect(first.headers.get("access-control-allow-origin")).toBe(SHOP);
    expect(await first.json()).toMatchObject({ status: "waiting_human", hasEmail: false });

    const again = await handleHandoff(
      post("handoff", { bot: bot.key, email: "mila@example.com" }, token),
      db(),
    );
    expect(await again.json()).toMatchObject({
      status: "waiting_human",
      message: null,
      hasEmail: true,
    });
    const conversation = await conversationOf(token);
    expect(conversation.visitor_email).toBe("mila@example.com");
    expect(await outboxOf(conversation.id)).toHaveLength(1);

    expect((await handleHandoff(post("handoff", { bot: bot.key }), db())).status).toBe(401);
  });
});

describe("owner_reply", () => {
  let owner: TestUser;
  let stranger: TestUser;
  let bot: { id: string; key: string };

  beforeAll(async () => {
    [owner, stranger] = await Promise.all([createUser(), createUser()]);
    bot = await setupBot(owner);
  });

  async function waitingChat(email: string | null) {
    const token = tokenOf(await send(bot.key, "Can I talk to a human?"));
    const conversation = await conversationOf(token);
    if (email) {
      await db().from("conversations").update({ visitor_email: email }).eq("id", conversation.id);
    }
    return { token, conversation };
  }

  it("lets the owner answer: human message, status human, read, channel returned", async () => {
    const { token, conversation } = await waitingChat(null);
    const { data, error } = await owner.client.rpc("owner_reply", {
      p_conversation_id: conversation.id,
      p_content: "  Hi, Mila here!  ",
      p_reply_email: replyEmail,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({
      status: "ok",
      emailed: false,
      realtime_channel: conversation.realtime_channel,
    });
    expect(await conversationOf(token)).toMatchObject({ status: "human", owner_unread: false });

    // The visitor's poll gets exactly the new human message.
    const poll = await handlePoll(
      new Request(`https://relay.test/api/widget/poll?bot=${bot.key}`, {
        headers: { "X-Relay-Token": token },
      }),
      db(),
    );
    const body = await poll.json();
    expect(body.status).toBe("human");
    expect(body.messages.map((m: { role: string; text: string }) => [m.role, m.text])).toEqual([
      ["system", expect.stringContaining("will reply here")],
      ["human", "Hi, Mila here!"],
    ]);
  });

  it("refuses other owners as if the chat didn't exist", async () => {
    const { conversation } = await waitingChat(null);
    const { data } = await stranger.client.rpc("owner_reply", {
      p_conversation_id: conversation.id,
      p_content: "I'm not the owner",
      p_reply_email: replyEmail,
    });
    expect(data).toEqual({ status: "not_found" });
    const { data: messages } = await db()
      .from("messages")
      .select("id")
      .eq("conversation_id", conversation.id)
      .eq("role", "human");
    expect(messages).toEqual([]);
  });

  it("refuses resolved chats and empty replies", async () => {
    const { conversation } = await waitingChat(null);
    const empty = await owner.client.rpc("owner_reply", {
      p_conversation_id: conversation.id,
      p_content: "   ",
      p_reply_email: replyEmail,
    });
    expect(empty.error?.code).toBe("22023");
    await owner.client
      .from("conversations")
      .update({ status: "resolved" })
      .eq("id", conversation.id);
    const closed = await owner.client.rpc("owner_reply", {
      p_conversation_id: conversation.id,
      p_content: "Hello?",
      p_reply_email: replyEmail,
    });
    expect(closed.data).toEqual({ status: "closed" });
  });

  it("emails the reply only to a visitor who left an email and has been away > 3 minutes", async () => {
    const reply = (id: string) =>
      owner.client.rpc("owner_reply", {
        p_conversation_id: id,
        p_content: "Your order shipped today.",
        p_reply_email: replyEmail,
      });

    const present = await waitingChat("here@example.com");
    expect((await reply(present.conversation.id)).data).toMatchObject({ emailed: false });

    const anonymous = await waitingChat(null);
    await db()
      .from("conversations")
      .update({ last_visitor_activity_at: new Date(Date.now() - 10 * 60_000).toISOString() })
      .eq("id", anonymous.conversation.id);
    expect((await reply(anonymous.conversation.id)).data).toMatchObject({ emailed: false });

    const away = await waitingChat("away@example.com");
    await db()
      .from("conversations")
      .update({ last_visitor_activity_at: new Date(Date.now() - 4 * 60_000).toISOString() })
      .eq("id", away.conversation.id);
    expect((await reply(away.conversation.id)).data).toMatchObject({ emailed: true });

    const emails = (await outboxOf(away.conversation.id)).filter((e) => e.type === "reply_email");
    expect(emails).toHaveLength(1);
    expect(emails[0]!.payload.data).toMatchObject({
      visitorEmail: "away@example.com",
      replyText: "Hello",
      conversationId: away.conversation.id,
    });
    expect(
      (await outboxOf(present.conversation.id)).filter((e) => e.type === "reply_email"),
    ).toHaveLength(0);
  });

  it("polling marks an open widget as present", async () => {
    const { token, conversation } = await waitingChat("present@example.com");
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    await db()
      .from("conversations")
      .update({ last_visitor_activity_at: old })
      .eq("id", conversation.id);
    await handlePoll(
      new Request(`https://relay.test/api/widget/poll?bot=${bot.key}`, {
        headers: { "X-Relay-Token": token },
      }),
      db(),
    );
    const after = await conversationOf(token);
    expect(new Date(after.last_visitor_activity_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe("inbox list columns", () => {
  it("keep the latest message as the conversation's preview", async () => {
    const owner = await createUser();
    const bot = await setupBot(owner);
    const token = tokenOf(await send(bot.key, "How long does shipping take?"));
    const { data } = await owner.client
      .from("conversations")
      .select("last_message_preview, last_message_role")
      .eq("id", (await conversationOf(token)).id)
      .single();
    expect(data).toEqual({ last_message_preview: "1–3 working days.", last_message_role: "bot" });
  });
});
