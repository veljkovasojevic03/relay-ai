import { describe, expect, it, vi } from "vitest";

import type { FlowState } from "@/lib/actions/flow";
import type { SearchResult } from "@/lib/faqs/search";
import { RETRIEVAL, type FaqMatch } from "@/lib/faqs/retrieval";

import type { WidgetEvent } from "./sse";
import { runTurn, type ReplyRecord, type TurnDeps, type TurnInput } from "./turn";

const faq = (id: string, similarity: number): FaqMatch => ({
  id,
  question: `Question ${id}?`,
  answer: "Delivery takes 1–3 working days within Serbia.",
  language: "en",
  featured: false,
  similarity,
  vectorRank: 1,
  textRank: null,
  rrfScore: 0,
  keywordOverlap: 0,
});

const answered: SearchResult = {
  matches: [faq("a", 0.95)],
  decision: { kind: "answer", faq: faq("a", 0.95) },
  settings: RETRIEVAL.en,
  semantic: true,
};
const unknown: SearchResult = {
  matches: [faq("b", 0.84)],
  decision: { kind: "unknown", suggestions: [faq("b", 0.84)] },
  settings: RETRIEVAL.en,
  semantic: true,
};
const degraded: SearchResult = { ...unknown, semantic: false };

const input: TurnInput = {
  botId: "bot",
  conversationId: "conversation",
  text: "How long is delivery?",
  language: "en",
  conversationStatus: "bot",
  remainingMessages: 19,
  mode: { mode: "sample", reason: "no_api_key" },
  startedAt: 1000,
  wantsHuman: false,
  flow: null,
  intent: null,
};

function deps(
  search: SearchResult | Error,
  record?: Error,
  opts: { streak?: number; handoff?: "handed_off" | "already" | Error } = {},
) {
  const log: string[] = [];
  const recorded: ReplyRecord[] = [];
  const flows: (FlowState | null)[] = [];
  const d: TurnDeps = {
    search: vi.fn(async () => {
      if (search instanceof Error) throw search;
      return search;
    }),
    recordReply: vi.fn(async (reply) => {
      log.push("record");
      if (record) throw record;
      recorded.push(reply);
      return { unknownStreak: opts.streak ?? 0 };
    }),
    handoff: vi.fn(async () => {
      if (opts.handoff instanceof Error) throw opts.handoff;
      const status = opts.handoff ?? "handed_off";
      const handed = status === "handed_off";
      return {
        status,
        message: handed ? "A person will reply here." : null,
        messageId: handed ? "m1" : null,
      };
    }),
    saveFlow: vi.fn(async (state) => {
      log.push("flow");
      flows.push(state);
    }),
    createRun: vi.fn(async (action) => {
      log.push("run");
      return { actionRunId: "run1", action: action.action, fields: [], simulated: true };
    }),
    sleep: async () => {},
    now: () => 1250,
  };
  return { d, log, recorded, flows };
}

async function collect(events: AsyncGenerator<WidgetEvent>, log?: string[]) {
  const out: WidgetEvent[] = [];
  for await (const e of events) {
    log?.push(e.event);
    out.push(e);
  }
  return out;
}

describe("runTurn", () => {
  it("answers: meta → delta… → sources → done, saving the reply before streaming", async () => {
    const { d, log, recorded } = deps(answered);
    const events = await collect(runTurn({ ...input, token: "tok" }, d), log);

    const names = events.map((e) => e.event);
    expect(names[0]).toBe("meta");
    expect(names.slice(-2)).toEqual(["sources", "done"]);
    expect(names.slice(1, -2).every((n) => n === "delta")).toBe(true);
    // The reply is persisted before the first delta goes out.
    expect(log.indexOf("record")).toBeLessThan(log.indexOf("delta"));

    expect(events[0]).toEqual({
      event: "meta",
      data: { token: "tok", mode: "sample", language: "en" },
    });
    const text = events
      .filter((e) => e.event === "delta")
      .map((e) => (e.data as { text: string }).text)
      .join("");
    expect(text).toBe("Delivery takes 1–3 working days within Serbia.");
    expect(events.at(-2)).toEqual({
      event: "sources",
      data: { faqs: [{ id: "a", question: "Question a?" }] },
    });
    expect(events.at(-1)).toEqual({
      event: "done",
      data: { outcome: "answered", offerHuman: false, suggestions: [], remainingMessages: 19 },
    });
    expect(recorded[0]).toMatchObject({
      outcome: "answered",
      sourceFaqIds: ["a"],
      firstResponseMs: 250,
      meta: { mode: "sample", modeReason: "no_api_key", latencyMs: 250, similarity: 0.95 },
    });
  });

  it("never repeats the token after the first message", async () => {
    const events = await collect(runTurn(input, deps(answered).d));
    expect(events[0]!.data).not.toHaveProperty("token");
  });

  it("doesn't know: no sources, offers a person and suggestions, logs it as unknown", async () => {
    const { d, recorded } = deps(unknown);
    const events = await collect(runTurn(input, d));
    expect(events.map((e) => e.event)).not.toContain("sources");
    expect(events.at(-1)).toEqual({
      event: "done",
      data: {
        outcome: "unknown",
        offerHuman: true,
        suggestions: ["Question b?"],
        remainingMessages: 19,
      },
    });
    expect(recorded[0]).toMatchObject({ outcome: "unknown", question: input.text });
  });

  it("answers in the visitor's language", async () => {
    const events = await collect(runTurn({ ...input, language: "sr" }, deps(unknown).d));
    const text = events
      .filter((e) => e.event === "delta")
      .map((e) => (e.data as { text: string }).text)
      .join("");
    expect(text).toMatch(/^Nisam siguran/);
  });

  it("reports retrieval outages as degraded, not as an unknown question", async () => {
    const { d, recorded } = deps(degraded);
    const events = await collect(runTurn(input, d));
    expect(events.at(-1)?.data).toMatchObject({ outcome: "degraded", offerHuman: true });
    expect(recorded[0]!.outcome).toBe("degraded");
  });

  it("stays quiet while a person handles the chat", async () => {
    const { d } = deps(answered);
    const events = await collect(runTurn({ ...input, conversationStatus: "human" }, d));
    expect(events.map((e) => e.event)).toEqual(["meta", "done"]);
    expect(events[1]!.data).toMatchObject({ outcome: "waiting" });
    expect(d.search).not.toHaveBeenCalled();
  });

  it("ends with an error event when search fails", async () => {
    const events = await collect(runTurn(input, deps(new Error("db down")).d));
    expect(events).toEqual([
      expect.objectContaining({ event: "meta" }),
      { event: "error", data: { code: "internal" } },
    ]);
  });

  it("ends with an error event, and streams nothing, when the reply can't be saved", async () => {
    const events = await collect(runTurn(input, deps(answered, new Error("insert failed")).d));
    expect(events.map((e) => e.event)).toEqual(["meta", "error"]);
  });

  it("hands off right away when the visitor asks for a person, without searching", async () => {
    const { d } = deps(answered);
    const events = await collect(runTurn({ ...input, wantsHuman: true }, d));
    expect(events.map((e) => e.event)).toEqual(["meta", "handoff", "done"]);
    expect(events[1]).toEqual({
      event: "handoff",
      data: {
        reason: "requested",
        status: "waiting_human",
        message: "A person will reply here.",
        messageId: "m1",
      },
    });
    expect(events[2]!.data).toMatchObject({ outcome: "handoff", offerHuman: false });
    expect(d.search).not.toHaveBeenCalled();
    expect(d.handoff).toHaveBeenCalledWith("requested");
  });

  it("hands off after the second unknown in a row: reply first, then handoff, then done", async () => {
    const { d } = deps(unknown, undefined, { streak: 2 });
    const events = await collect(runTurn(input, d));
    const names = events.map((e) => e.event);
    expect(names.at(-2)).toBe("handoff");
    expect(names.at(-1)).toBe("done");
    expect(names.slice(1, -2).every((n) => n === "delta")).toBe(true);
    expect(events.at(-2)!.data).toMatchObject({ reason: "unknown_twice" });
    expect(events.at(-1)!.data).toMatchObject({ outcome: "unknown", offerHuman: false });
  });

  it("doesn't hand off after a single unknown", async () => {
    const { d } = deps(unknown, undefined, { streak: 1 });
    const events = await collect(runTurn(input, d));
    expect(events.map((e) => e.event)).not.toContain("handoff");
    expect(d.handoff).not.toHaveBeenCalled();
  });

  it("keeps offering a person when the handoff itself fails", async () => {
    const { d } = deps(unknown, undefined, { streak: 2, handoff: new Error("db down") });
    const events = await collect(runTurn(input, d));
    expect(events.map((e) => e.event)).not.toContain("handoff");
    expect(events.at(-1)!.data).toMatchObject({ outcome: "unknown", offerHuman: true });
  });

  it("passes the realtime channel along with the token on the first message", async () => {
    const events = await collect(
      runTurn({ ...input, token: "tok", channel: "chan" }, deps(answered).d),
    );
    expect(events[0]!.data).toMatchObject({ token: "tok", channel: "chan" });
  });
});

describe("runTurn: guided action flows", () => {
  it("starts a flow on an enabled intent: asks, saves the state, offers Cancel, skips the FAQ", async () => {
    const { d, log, recorded, flows } = deps(answered);
    const events = await collect(runTurn({ ...input, intent: "order_status" }, d), log);
    expect(d.search).not.toHaveBeenCalled();
    expect(log.slice(0, 4)).toEqual(["meta", "flow", "record", "delta"]);
    expect(flows[0]).toMatchObject({ action: "order_status", step: "orderNumber" });
    expect(recorded[0]).toMatchObject({ outcome: "flow" });
    expect(events.at(-1)!.data).toMatchObject({ outcome: "flow", quickReplies: ["Cancel"] });
  });

  it("ends a flow in a confirmation card: state cleared, run created, card before done", async () => {
    const { d, flows } = deps(answered);
    const flow: FlowState = {
      action: "order_status",
      step: "email",
      params: { orderNumber: "KR-10482" },
      tries: 0,
    };
    const events = await collect(runTurn({ ...input, flow, text: "marko@example.com" }, d));
    expect(flows).toEqual([null]);
    expect(d.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "order_status",
        params: { orderNumber: "KR-10482", email: "marko@example.com" },
      }),
    );
    expect(events.map((e) => e.event).slice(-2)).toEqual(["action_card", "done"]);
    expect(events.at(-2)!.data).toMatchObject({ actionRunId: "run1" });
  });

  it("a request for a person during a flow ends the flow and hands off", async () => {
    const { d, flows } = deps(answered);
    const flow: FlowState = { action: "create_ticket", step: "subject", params: {}, tries: 0 };
    const events = await collect(runTurn({ ...input, flow, wantsHuman: true }, d));
    expect(flows).toEqual([null]);
    expect(events.map((e) => e.event)).toContain("handoff");
    expect(d.createRun).not.toHaveBeenCalled();
  });

  it("reports an error and creates nothing visible when the state can't be saved", async () => {
    const { d } = deps(answered);
    d.saveFlow = vi.fn(async () => {
      throw new Error("db down");
    });
    const events = await collect(runTurn({ ...input, intent: "create_ticket" }, d));
    expect(events.map((e) => e.event)).toEqual(["meta", "error"]);
  });
});
