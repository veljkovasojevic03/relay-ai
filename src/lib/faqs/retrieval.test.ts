import { describe, expect, it } from "vitest";

import { decideAnswer, type FaqMatch, type RetrievalSettings } from "./retrieval";

const settings: RetrievalSettings = {
  hybrid: false,
  threshold: 0.88,
  corroboratedThreshold: 0.8,
  minOverlap: 0.5,
};

const match = (id: string, similarity: number | null, keywordOverlap: number | null): FaqMatch => ({
  id,
  question: id,
  answer: `answer ${id}`,
  language: "en",
  featured: false,
  similarity,
  vectorRank: similarity === null ? null : 1,
  textRank: keywordOverlap ? 1 : null,
  rrfScore: 0,
  keywordOverlap,
});

describe("decideAnswer", () => {
  it("answers from the top match above the threshold", () => {
    const decision = decideAnswer([match("a", 0.9, 0), match("b", 0.95, 1)], settings);
    expect(decision).toMatchObject({ kind: "answer", faq: { id: "a" } });
  });

  it("accepts a lower similarity only with enough keyword overlap", () => {
    expect(decideAnswer([match("a", 0.82, 0.5)], settings).kind).toBe("answer");
    expect(decideAnswer([match("a", 0.82, 0.49)], settings).kind).toBe("unknown");
    expect(decideAnswer([match("a", 0.82, null)], settings).kind).toBe("unknown");
    expect(decideAnswer([match("a", 0.79, 1)], settings).kind).toBe("unknown");
  });

  it("never answers without a similarity (text-only fallback)", () => {
    expect(decideAnswer([match("a", null, 1)], settings).kind).toBe("unknown");
  });

  it("offers up to three close questions as suggestions when it declines", () => {
    const matches = [0.86, 0.84, 0.82, 0.81].map((s, i) => match(String(i), s, 0));
    const decision = decideAnswer(matches, settings);
    expect(decision.kind === "unknown" && decision.suggestions.map((m) => m.id)).toEqual([
      "0",
      "1",
      "2",
    ]);
  });

  it("offers nothing that isn't close", () => {
    const matches = [0.79, 0.7].map((s, i) => match(String(i), s, 0));
    expect(decideAnswer(matches, settings)).toEqual({ kind: "unknown", suggestions: [] });
  });

  it("declines when nothing matched", () => {
    expect(decideAnswer([], settings)).toEqual({ kind: "unknown", suggestions: [] });
  });

  it("never lets the corroborated bar exceed the plain threshold", () => {
    const odd = { ...settings, corroboratedThreshold: 0.99 };
    expect(decideAnswer([match("a", 0.9, 1)], odd).kind).toBe("answer");
  });
});
