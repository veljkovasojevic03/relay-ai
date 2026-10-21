import { describe, expect, it, vi } from "vitest";

import { envelope, type Envelope } from "./contract";
import { createRealDispatcher } from "./dispatcher";
import { retryDelaySeconds, MAX_ATTEMPTS } from "./outbox";
import { signEvent } from "./signing";

vi.mock("server-only", () => ({}));

const SECRET = "k".repeat(64);
const NOW = 1_760_950_000_000;
const parts = {
  bot: { id: "b1", name: "Kroj Support" },
  owner: { notificationEmail: "owner@example.com", language: "sr" as const },
};
const escalation = envelope("e1", "escalation", "2026-10-20T10:15:00.000Z", {
  ...parts,
  data: { conversationId: "c1" },
});
const order = envelope("e2", "action.order_status", "2026-10-20T10:15:00.000Z", {
  ...parts,
  data: { actionRunId: "r1", params: { orderNumber: "KR-10482", email: "marko@example.com" } },
}) as Envelope & { type: "action.order_status" };

function dispatcherWith(response: Response | Error) {
  const fetch = vi.fn(async (..._args: Parameters<typeof globalThis.fetch>) => {
    if (response instanceof Error) throw response;
    return response;
  });
  const dispatcher = createRealDispatcher({
    base: "http://localhost:5678/webhook/",
    secret: SECRET,
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => NOW,
  });
  return { dispatcher, fetch };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

describe("real dispatcher", () => {
  it("POSTs the envelope to <base>/<path> with signed headers", async () => {
    const { dispatcher, fetch } = dispatcherWith(json({ received: true }));
    await expect(dispatcher.deliver(escalation)).resolves.toEqual({ kind: "accepted" });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://localhost:5678/webhook/relay-escalation");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Relay-Timestamp": String(NOW),
      "X-Relay-Signature": signEvent(SECRET, NOW, "e1"),
      "Idempotency-Key": "e1",
    });
    const body = JSON.parse(String(init?.body));
    expect(Object.keys(body)).toEqual(["eventId", "type", "createdAt", "bot", "owner", "data"]);
  });

  it.each([
    [json({}, 404), "http_404"],
    [new DOMException("timed out", "TimeoutError"), "timeout"],
    [new TypeError("fetch failed"), "network"],
  ])("asks for a retry when delivery fails (%#)", async (response, error) => {
    const { dispatcher } = dispatcherWith(response as Response | Error);
    await expect(dispatcher.deliver(escalation)).resolves.toEqual({ kind: "retry", error });
  });

  it("returns a validated action result", async () => {
    const result = { found: true, status: "shipped", eta: "2026-10-24", items: ["Patike Trk"] };
    const { dispatcher } = dispatcherWith(json({ ok: true, result }));
    await expect(dispatcher.runAction(order)).resolves.toEqual({
      ok: true,
      result,
      simulated: false,
    });
  });

  it.each([
    [json({ ok: false, error: "invalid_signature" }, 401), "invalid_signature"],
    [json({ ok: false, error: "upstream_error" }, 502), "upstream_error"],
    [json({ ok: true, result: { found: "yes" } }), "malformed_response"],
    [new Response("<html>oops</html>", { status: 500 }), "http_500"],
    [new DOMException("timed out", "TimeoutError"), "timeout"],
  ])("turns every non-OK answer into a failure (%#)", async (response, error) => {
    const { dispatcher } = dispatcherWith(response as Response | Error);
    await expect(dispatcher.runAction(order)).resolves.toEqual({
      ok: false,
      error,
      simulated: false,
    });
  });
});

describe("retry backoff", () => {
  it("grows with each attempt and stays at the last step", () => {
    const delays = Array.from({ length: MAX_ATTEMPTS + 2 }, (_, i) => retryDelaySeconds(i + 1));
    for (let i = 1; i < MAX_ATTEMPTS; i++) expect(delays[i]).toBeGreaterThan(delays[i - 1]!);
    expect(delays.at(-1)).toBe(delays[MAX_ATTEMPTS - 1]);
  });
});
