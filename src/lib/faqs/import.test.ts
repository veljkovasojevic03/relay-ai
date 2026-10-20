import { describe, expect, it } from "vitest";

import { parseFaqImport } from "./import";
import { IMPORT_MAX } from "./schema";

describe("parseFaqImport", () => {
  it("reads Q:/A: blocks, including multi-line answers", () => {
    const result = parseFaqImport(
      [
        "Q: How long does delivery take?",
        "A: 1–3 working days.",
        "",
        "Q: Can I return shoes?",
        "A: Yes, within 14 days.",
        "Unworn, with tags.",
        "",
        "",
        "",
        "Bring the receipt.",
      ].join("\n"),
    );
    expect(result.problems).toEqual([]);
    expect(result.items).toEqual([
      { question: "How long does delivery take?", answer: "1–3 working days." },
      {
        question: "Can I return shoes?",
        answer: "Yes, within 14 days.\nUnworn, with tags.\n\nBring the receipt.",
      },
    ]);
  });

  it("accepts Serbian P:/O:, any case and spacing, and CRLF", () => {
    const result = parseFaqImport("p : Koliko traje dostava?\r\no: 1–3 radna dana.\r\n");
    expect(result.items).toEqual([
      { question: "Koliko traje dostava?", answer: "1–3 radna dana." },
    ]);
  });

  it("joins a question that wraps onto several lines", () => {
    const result = parseFaqImport("Q: Do you ship\nabroad?\nA: Yes.");
    expect(result.items).toEqual([{ question: "Do you ship abroad?", answer: "Yes." }]);
  });

  it("reports questions without answers and answers without questions", () => {
    const result = parseFaqImport("A: orphan\nmore orphan\nQ: First?\nQ: Second?\nA: Yes.");
    expect(result.items).toEqual([{ question: "Second?", answer: "Yes." }]);
    expect(result.problems).toEqual([
      { kind: "missingQuestion", line: 1 },
      { kind: "missingAnswer", line: 3, question: "First?" },
    ]);
  });

  it("rejects over-long fields instead of truncating them", () => {
    const result = parseFaqImport(`Q: ${"x".repeat(501)}\nA: ok\nQ: ok?\nA: ${"y".repeat(4001)}`);
    expect(result.items).toEqual([]);
    expect(result.problems.map((p) => p.kind)).toEqual(["questionTooLong", "answerTooLong"]);
  });

  it("flags imports above the limit", () => {
    const text = Array.from({ length: IMPORT_MAX + 1 }, (_, i) => `Q: q${i}?\nA: a${i}`).join("\n");
    const result = parseFaqImport(text);
    expect(result.items).toHaveLength(IMPORT_MAX + 1);
    expect(result.problems).toContainEqual({ kind: "tooMany", max: IMPORT_MAX });
  });

  it("returns nothing for empty or marker-less text", () => {
    expect(parseFaqImport("")).toEqual({ items: [], problems: [] });
    expect(parseFaqImport("just some notes\nwithout markers")).toEqual({
      items: [],
      problems: [],
    });
  });
});
