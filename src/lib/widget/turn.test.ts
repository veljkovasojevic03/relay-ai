import { describe, expect, it, vi } from "vitest";

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
};

function deps(search: SearchResult | Error, record?: Error) {
  const log: string[] = [];
  const recorded: ReplyRecord[] = [];
  const d: TurnDeps = {
    search: vi.fn(async () => {
      if (search instanceof Error) throw search;
      return search;
    }),
    recordReply: vi.fn(async (reply) => {
      log.push("record");
      if (record) throw record;
      recorded.push(reply);
    }),
    sleep: async () => {},
    now: () => 1250,
  };
  return { d, log, recorded };
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
});
