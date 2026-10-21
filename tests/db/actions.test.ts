import { beforeAll, describe, expect, it } from "vitest";

import { handleConfirm, handleHandoff } from "@/lib/widget/handlers";

import { createUser, type TestUser } from "./helpers";
import { conversationOf, db, replyText, send, setupBot, SHOP, tokenOf } from "./widget-helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- assertions pin the shapes
type Loose = any;

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

async function enable(botId: string, names: string[]) {
  const { data: actions } = await db().from("actions").select("id, name").in("name", names);
  for (const a of actions ?? []) {
    await db()
      .from("bot_actions")
      .upsert(
        { bot_id: botId, action_id: a.id, enabled: true },
        { onConflict: "bot_id,action_id" },
      );
  }
}

const cardOf = (sent: { events: { event: string; data: Loose }[] }) =>
  sent.events.find((e) => e.event === "action_card")?.data;

async function confirm(key: string, token: string, actionRunId: string, decision = "confirm") {
  const response = await handleConfirm(
    post("confirm", { bot: key, actionRunId, decision }, token),
    db(),
  );
  return { status: response.status, json: (await response.json()) as Loose };
}

/** Runs the order flow up to the confirmation card. */
async function orderCard(key: string, orderNumber: string, email: string) {
  const first = await send(key, "Track my order", { origin: SHOP });
  const token = tokenOf(first);
  await send(key, orderNumber, { origin: SHOP, token });
  const last = await send(key, email, { origin: SHOP, token });
  return { token, card: cardOf(last), first, last };
}

describe("guided actions (simulated n8n)", () => {
  let owner: TestUser;
  let demo: { id: string; key: string };
  let shop: { id: string; key: string };

  beforeAll(async () => {
    owner = await createUser();
    demo = await setupBot(owner);
    await db().from("bots").update({ is_demo: true }).eq("id", demo.id);
    await enable(demo.id, ["order_status", "create_ticket"]);
    const other = await createUser();
    shop = await setupBot(other);
    await enable(shop.id, ["order_status", "create_ticket"]);
  });

  it("order_status: intent → order number → email → card → confirm → result, all logged", async () => {
    const first = await send(demo.key, "Track my order", { origin: SHOP });
    expect(replyText(first)).toContain("order number");
    expect(first.events.at(-1)!.data).toMatchObject({ outcome: "flow", quickReplies: ["Cancel"] });
    const token = tokenOf(first);

    const second = await send(demo.key, "kr-10482", { origin: SHOP, token });
    expect(replyText(second)).toContain("email");
    const third = await send(demo.key, "marko@example.com", { origin: SHOP, token });
    const card = cardOf(third);
    expect(card).toMatchObject({
      action: "order_status",
      simulated: true,
      fields: [
        { key: "orderNumber", value: "KR-10482" },
        { key: "email", value: "marko@example.com" },
      ],
    });
    expect((await conversationOf(token)).action_flow).toBeNull();

    const result = await confirm(demo.key, token, card.actionRunId);
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ status: "succeeded", simulated: true, offerHuman: false });
    expect(result.json.message).toContain("KR-10482 is on its way");
    expect(result.json.message).toContain("Patike Trk");

    const { data: run } = await db()
      .from("action_runs")
      .select("status, params, result, simulated, duration_ms")
      .eq("id", card.actionRunId)
      .single();
    expect(run).toMatchObject({
      status: "succeeded",
      simulated: true,
      params: { orderNumber: "KR-10482", email: "m***@example.com" },
      result: { found: true, status: "shipped" },
    });

    const { data: events } = await db()
      .from("n8n_outbox")
      .select("type, status, payload")
      .filter("payload->data->>actionRunId", "eq", card.actionRunId);
    expect(events).toHaveLength(1);
    expect(events![0]).toMatchObject({ type: "action.order_status", status: "simulated" });
    // The stored event is PII-minimal; the full email only ever went to the dispatcher.
    expect(JSON.stringify(events![0]!.payload)).not.toContain("marko@example.com");
  });

  it("a wrong email and a missing order give the identical answer", async () => {
    const wrongEmail = await orderCard(demo.key, "KR-10482", "someone@example.com");
    const missing = await orderCard(demo.key, "KR-99999", "marko@example.com");
    const a = await confirm(demo.key, wrongEmail.token, wrongEmail.card.actionRunId);
    const b = await confirm(demo.key, missing.token, missing.card.actionRunId);
    expect(a.json.message).toBe(b.json.message);
    expect(a.json.status).toBe("succeeded");
  });

  it("a card runs at most once, and only from its own conversation", async () => {
    const { token, card } = await orderCard(demo.key, "KR-10561", "sara.jovanovic@example.com");
    const stranger = tokenOf(await send(demo.key, "hello", { origin: SHOP }));
    expect((await confirm(demo.key, stranger, card.actionRunId)).status).toBe(409);
    expect((await confirm(demo.key, token, card.actionRunId)).status).toBe(200);
    expect((await confirm(demo.key, token, card.actionRunId)).json).toEqual({
      error: "action_not_pending",
    });
  });

  it("cancel runs nothing; a new message passes over an open card", async () => {
    const first = await orderCard(demo.key, "KR-10598", "luka@example.com");
    const cancelled = await confirm(demo.key, first.token, first.card.actionRunId, "cancel");
    expect(cancelled.json).toMatchObject({ status: "cancelled" });

    const second = await orderCard(demo.key, "KR-10598", "luka@example.com");
    await send(demo.key, "How long does shipping take?", { origin: SHOP, token: second.token });
    const { data: run } = await db()
      .from("action_runs")
      .select("status")
      .eq("id", second.card.actionRunId)
      .single();
    expect(run!.status).toBe("cancelled");
    expect((await confirm(demo.key, second.token, second.card.actionRunId)).status).toBe(409);
  });

  it("order_status is never offered by a bot that isn't the demo bot", async () => {
    const sent = await send(shop.key, "Track my order", { origin: SHOP });
    expect(sent.events.at(-1)!.data.outcome).not.toBe("flow");
    expect((await conversationOf(tokenOf(sent))).action_flow).toBeNull();
  });

  it("create_ticket: collects the details and stores the ticket with n8n's reference", async () => {
    const first = await send(shop.key, "Report a problem", { origin: SHOP });
    const token = tokenOf(first);
    await send(shop.key, "Wrong size <b>delivered</b>", { origin: SHOP, token });
    await send(shop.key, "I got 41 instead of 42 & the box was open.", { origin: SHOP, token });
    const card = cardOf(await send(shop.key, "Skip", { origin: SHOP, token }));
    expect(card.fields.map((f: Loose) => f.key)).toEqual(["subject", "description"]);

    const result = await confirm(shop.key, token, card.actionRunId);
    expect(result.json.status).toBe("succeeded");
    const reference = /RLY-\d{4}/.exec(result.json.message)?.[0];
    expect(reference).toBeDefined();

    const conversation = await conversationOf(token);
    const { data: ticket } = await db()
      .from("tickets")
      .select("subject, description, reference, visitor_email")
      .eq("conversation_id", conversation.id)
      .single();
    expect(ticket).toEqual({
      subject: "Wrong size <b>delivered</b>",
      description: "I got 41 instead of 42 & the box was open.",
      reference,
      visitor_email: null,
    });
  });

  it("history shows an unconfirmed card again after a refresh", async () => {
    const { handleConversation } = await import("@/lib/widget/handlers");
    const { token, card } = await orderCard(demo.key, "KR-10377", "ana.petrovic@example.com");
    const response = await handleConversation(
      new Request(`https://relay.test/api/widget/conversation?bot=${demo.key}`, {
        headers: { Origin: SHOP, "X-Relay-Token": token },
      }),
      db(),
    );
    const history = (await response.json()) as Loose;
    expect(history.pendingAction).toMatchObject({ actionRunId: card.actionRunId });
  });

  it("asking for a person right after a failed action escalates as action_failed", async () => {
    const { token, card } = await orderCard(demo.key, "KR-10233", "nikola@example.com");
    await db()
      .from("action_runs")
      .update({ status: "failed", error: "timeout" })
      .eq("id", card.actionRunId);
    const response = await handleHandoff(post("handoff", { bot: demo.key }, token), db());
    expect(response.status).toBe(200);
    const conversation = await conversationOf(token);
    const { data } = await db()
      .from("n8n_outbox")
      .select("payload")
      .eq("type", "escalation")
      .filter("payload->data->>conversationId", "eq", conversation.id)
      .single();
    expect((data!.payload as Loose).data.reason).toBe("action_failed");
  });
});
