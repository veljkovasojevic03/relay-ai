import { describe, expect, it } from "vitest";

import { prng } from "@/lib/demo/analytics-seed";

import { groupUnknown, parseRange, percent, type UnknownRow } from "./summary";

const row = (over: Partial<UnknownRow>): UnknownRow => ({
  id: crypto.randomUUID(),
  botId: "bot",
  question: "Do you have size 52?",
  language: "en",
  suggestedAnswer: null,
  suggestionSource: "none",
  createdAt: "2026-10-20T10:00:00Z",
  ...over,
});

describe("groupUnknown", () => {
  it("merges the same question regardless of case, spacing, diacritics and end punctuation", () => {
    const groups = groupUnknown([
      row({ question: "Do you have size 52?" }),
      row({ question: "do you  have size 52", createdAt: "2026-10-21T10:00:00Z" }),
      row({ question: "Da li imate broj 52?", language: "sr" }),
      row({ question: "Da li imaté broj 52!", language: "sr" }),
    ]);
    expect(groups.map((g) => [g.question, g.count])).toEqual([
      // Newest wording wins; equal counts sort by recency.
      ["do you  have size 52", 2],
      ["Da li imate broj 52?", 2],
    ]);
    expect(groups[0]!.ids).toHaveLength(2);
  });

  it("keeps bots and languages apart", () => {
    const groups = groupUnknown([row({}), row({ botId: "other" }), row({ language: "sr" })]);
    expect(groups).toHaveLength(3);
  });

  it("uses the newest available suggestion and sorts by how often it was asked", () => {
    const groups = groupUnknown([
      row({ question: "Rare?", createdAt: "2026-10-22T10:00:00Z" }),
      row({ suggestedAnswer: "Older reply", suggestionSource: "human_reply" }),
      row({
        suggestedAnswer: "Newer reply",
        suggestionSource: "human_reply",
        createdAt: "2026-10-21T09:00:00Z",
      }),
      row({ createdAt: "2026-10-21T12:00:00Z" }),
    ]);
    expect(groups[0]).toMatchObject({
      count: 3,
      suggestedAnswer: "Newer reply",
      suggestionSource: "human_reply",
      lastAskedAt: "2026-10-21T12:00:00Z",
    });
    expect(groups[1]!.question).toBe("Rare?");
  });
});

describe("percent and ranges", () => {
  it("rounds shares and has no share of nothing", () => {
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 0)).toBeNull();
  });

  it("accepts only the offered ranges", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange("90")).toBe(90);
    expect(parseRange("365")).toBe(30);
    expect(parseRange(undefined)).toBe(30);
  });
});

describe("seed PRNG", () => {
  it("is deterministic per seed", () => {
    const a = prng(7);
    const b = prng(7);
    const c = prng(8);
    const seq = (r: () => number) => Array.from({ length: 5 }, r);
    expect(seq(a)).toEqual(seq(b));
    expect(seq(prng(7))).not.toEqual(seq(c));
  });
});
