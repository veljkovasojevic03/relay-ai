import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { createRealDispatcher, createSimulatedDispatcher } from "@/lib/n8n/dispatcher";
import { handleCallback, handleDigest, handleOrderLookup } from "@/lib/n8n/endpoints";
import { flushOutbox, MAX_ATTEMPTS } from "@/lib/n8n/outbox";
import { signEvent } from "@/lib/n8n/signing";

import { createBot, createUser, type TestUser } from "./helpers";
import { db } from "./widget-helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- assertions pin the shapes
type Loose = any;

const SECRET = process.env.N8N_SHARED_SECRET!;
const parts = (botId: string) => ({
  bot: { id: botId, name: "Shop" },
  owner: { notificationEmail: "owner@relay.test", language: "en" },
  data: { conversationId: randomUUID(), lastMessages: [], inboxUrl: "https://relay.test/x" },
});

async function enqueue(owner: TestUser, botId: string, overrides: Record<string, unknown> = {}) {
  const { data, error } = await db()
    .from("n8n_outbox")
    .insert({ owner_id: owner.id, type: "escalation", payload: parts(botId), ...overrides })
    .select("id, event_id")
    .single();
  if (error) throw error;
  return data;
}

const rowOf = async (id: string) =>
  (await db().from("n8n_outbox").select("*").eq("id", id).single()).data!;

function callback(body: unknown, opts: { ts?: number; secret?: string; eventId?: string } = {}) {
  const ts = opts.ts ?? Date.now();
  const eventId = opts.eventId ?? (body as { eventId?: string }).eventId ?? "";
  return new Request("https://relay.test/api/n8n/callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Relay-Timestamp": String(ts),
      "X-Relay-Signature": signEvent(opts.secret ?? SECRET, ts, eventId),
    },
    body: JSON.stringify(body),
  });
}

/** Only rows of this test's owner, so other files' leftovers can't interfere. */
async function flushOwn(dispatcher: Parameters<typeof flushOutbox>[1], ids: string[]) {
  // Park everything else, flush, then restore: claim_outbox has no owner filter by design.
  const { data: others } = await db()
    .from("n8n_outbox")
    .update({ next_attempt_at: "2999-01-01T00:00:00Z" })
    .eq("status", "pending")
    .not("id", "in", `(${ids.join(",")})`)
    .select("id");
  try {
    return await flushOutbox(db(), dispatcher, 50);
  } finally {
    if (others?.length) {
      await db()
        .from("n8n_outbox")
        .update({ next_attempt_at: new Date().toISOString() })
        .in(
          "id",
          others.map((o) => o.id),
        );
    }
  }
}

describe("outbox delivery", () => {
  let owner: TestUser;
  let botId: string;

  beforeAll(async () => {
    owner = await createUser();
    botId = (await createBot(owner)).id;
  });

  it("simulated: marks due events simulated, once", async () => {
    const row = await enqueue(owner, botId);
    const result = await flushOwn(createSimulatedDispatcher(db()), [row.id]);
    expect(result).toMatchObject({ claimed: 1, simulated: 1 });
    expect(await rowOf(row.id)).toMatchObject({ status: "simulated", attempts: 1 });
    expect((await flushOwn(createSimulatedDispatcher(db()), [row.id])).claimed).toBe(0);
  });

  it("real: a failed delivery backs off, then fails for good after MAX_ATTEMPTS", async () => {
    const row = await enqueue(owner, botId);
    const down = createRealDispatcher({
      base: "http://n8n.invalid/webhook",
      secret: SECRET,
      fetch: vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch,
    });
    await flushOwn(down, [row.id]);
    const first = await rowOf(row.id);
    expect(first).toMatchObject({ status: "pending", attempts: 1, last_error: "http_404" });
    expect(Date.parse(first.next_attempt_at)).toBeGreaterThan(Date.now() + 30_000);

    await db()
      .from("n8n_outbox")
      .update({ attempts: MAX_ATTEMPTS - 1, next_attempt_at: new Date().toISOString() })
      .eq("id", row.id);
    await flushOwn(down, [row.id]);
    expect(await rowOf(row.id)).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
  });

  it("real: accepted → delivered, and the signed callback marks it sent", async () => {
    const row = await enqueue(owner, botId);
    const fetchMock = vi.fn(async () => Response.json({ received: true }));
    const up = createRealDispatcher({
      base: "http://n8n.test/webhook",
      secret: SECRET,
      fetch: fetchMock as unknown as typeof fetch,
    });
    await flushOwn(up, [row.id]);
    expect(await rowOf(row.id)).toMatchObject({ status: "delivered" });

    const body = { eventId: row.event_id, status: "sent" };
    const applied = await handleCallback(callback(body), db(), SECRET);
    expect(applied.status).toBe(200);
    expect(await applied.json()).toEqual({ ok: true, result: "applied" });
    expect(await rowOf(row.id)).toMatchObject({ status: "sent" });

    // Replays (same eventId, freshly signed) are acknowledged and change nothing.
    const replayed = await handleCallback(
      callback({ eventId: row.event_id, status: "failed", error: "x" }),
      db(),
      SECRET,
    );
    expect(await replayed.json()).toEqual({ ok: true, result: "replayed" });
    expect(await rowOf(row.id)).toMatchObject({ status: "sent", last_error: null });
  });

  it("a failed callback records n8n's error", async () => {
    const row = await enqueue(owner, botId, { status: "delivered" });
    const body = { eventId: row.event_id, status: "failed", error: "SMTP auth failed" };
    await handleCallback(callback(body), db(), SECRET);
    expect(await rowOf(row.id)).toMatchObject({ status: "failed", last_error: "SMTP auth failed" });
  });

  it("a callback can't beat the delivery update: a sent row stays sent", async () => {
    const row = await enqueue(owner, botId);
    await handleCallback(callback({ eventId: row.event_id, status: "sent" }), db(), SECRET);
    const up = createRealDispatcher({
      base: "http://n8n.test/webhook",
      secret: SECRET,
      fetch: vi.fn(async () => Response.json({ received: true })) as unknown as typeof fetch,
    });
    // The row is already sent, so it isn't pending and nothing claims it.
    await flushOwn(up, [row.id]);
    expect(await rowOf(row.id)).toMatchObject({ status: "sent" });
  });
});

describe("callback rejection rules", () => {
  let owner: TestUser;
  let eventId: string;
  let rowId: string;
  let botId: string;

  beforeAll(async () => {
    owner = await createUser();
    botId = (await createBot(owner)).id;
    const row = await enqueue(owner, botId, { status: "delivered" });
    eventId = row.event_id;
    rowId = row.id;
  });

  const expectRejected = async (request: Request, status: number, error: string) => {
    const response = await handleCallback(request, db(), SECRET);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ ok: false, error });
    expect(await rowOf(rowId)).toMatchObject({ status: "delivered" });
  };

  it("refuses a wrong secret", () =>
    expectRejected(
      callback({ eventId, status: "sent" }, { secret: "wrong-secret" }),
      401,
      "invalid_signature",
    ));

  it("refuses a timestamp from 10 minutes ago", () =>
    expectRejected(
      callback({ eventId, status: "sent" }, { ts: Date.now() - 10 * 60_000 }),
      401,
      "stale_timestamp",
    ));

  it("refuses a body eventId other than the signed one", () =>
    expectRejected(
      callback({ eventId, status: "sent" }, { eventId: randomUUID() }),
      401,
      "invalid_signature",
    ));

  it("refuses missing headers and malformed bodies", async () => {
    await expectRejected(
      new Request("https://relay.test/api/n8n/callback", {
        method: "POST",
        body: JSON.stringify({ eventId, status: "sent" }),
      }),
      400,
      "bad_request",
    );
    await expectRejected(callback({ eventId, status: "delivered" }), 400, "bad_request");
    await expectRejected(callback({}, { eventId: "" }), 400, "bad_request");
  });

  it("answers 404 for an event it never sent, and ignores simulated ones", async () => {
    const unknown = await handleCallback(
      callback({ eventId: randomUUID(), status: "sent" }),
      db(),
      SECRET,
    );
    expect(unknown.status).toBe(404);
    const simulated = await enqueue(owner, botId, { status: "simulated" });
    const response = await handleCallback(
      callback({ eventId: simulated.event_id, status: "sent" }),
      db(),
      SECRET,
    );
    expect(response.status).toBe(404);
    expect(await rowOf(simulated.id)).toMatchObject({ status: "simulated" });
  });
});

describe("pull endpoints", () => {
  const lookup = (body: unknown, secret: string | null = SECRET) =>
    handleOrderLookup(
      new Request("https://relay.test/api/demo/orders/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "X-Relay-Secret": secret } : {}),
        },
        body: JSON.stringify(body),
      }),
      db(),
      SECRET,
    );

  it("order lookup needs the shared secret", async () => {
    expect(
      (await lookup({ orderNumber: "KR-10482", email: "marko@example.com" }, null)).status,
    ).toBe(401);
    expect(
      (await lookup({ orderNumber: "KR-10482", email: "marko@example.com" }, "nope")).status,
    ).toBe(401);
  });

  it("finds an order only with the matching email, and says nothing more otherwise", async () => {
    const found = await (
      await lookup({ orderNumber: "kr-10482", email: "Marko@example.com" })
    ).json();
    expect(found).toEqual({
      found: true,
      status: "shipped",
      eta: "2026-10-24",
      items: ["Patike Trk", "Čarape Basic (3 para)"],
    });
    const wrongEmail = await (
      await lookup({ orderNumber: "KR-10482", email: "x@example.com" })
    ).text();
    const missing = await (
      await lookup({ orderNumber: "KR-00000", email: "marko@example.com" })
    ).text();
    expect(wrongEmail).toBe('{"found":false}');
    expect(missing).toBe(wrongEmail);
  });

  it("GET works with query parameters; a bad body is a 400", async () => {
    const url =
      "https://relay.test/api/demo/orders/lookup?orderNumber=KR-10519&email=jelena@example.com";
    const response = await handleOrderLookup(
      new Request(url, { headers: { "X-Relay-Secret": SECRET } }),
      db(),
      SECRET,
    );
    expect(await response.json()).toMatchObject({ found: true, status: "processing" });
    expect((await lookup({ orderNumber: "" })).status).toBe(400);
  });

  it("digest lists only owners who opted in", async () => {
    const opted = await createUser();
    const silent = await createUser();
    await db().from("profiles").update({ weekly_digest: true }).eq("id", opted.id);
    const response = await handleDigest(
      new Request("https://relay.test/api/n8n/digest?period=7d", {
        headers: { "X-Relay-Secret": SECRET },
      }),
      db(),
      SECRET,
    );
    const body = (await response.json()) as Loose;
    expect(body).toMatchObject({ ok: true, period: { days: 7 } });
    const emails = (body.owners as Loose[]).map((o) => o.notificationEmail);
    expect(emails).toContain(opted.email);
    expect(emails).not.toContain(silent.email);
    expect(body.owners.find((o: Loose) => o.notificationEmail === opted.email)).toMatchObject({
      conversations: 0,
      topUnknownQuestions: [],
    });

    const bad = await handleDigest(
      new Request("https://relay.test/api/n8n/digest?period=1y", {
        headers: { "X-Relay-Secret": SECRET },
      }),
      db(),
      SECRET,
    );
    expect(bad.status).toBe(400);
  });
});
