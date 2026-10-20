import { describe, expect, it } from "vitest";

import { faqEmbeddingText, normalizeForSearch, queryEmbeddingText } from "./text";

describe("normalizeForSearch", () => {
  it.each([
    ["Šta je rok za povraćaj?", "sta je rok za povracaj?"],
    ["ČAŠA  ćevap\tžuto", "casa cevap zuto"],
    ["Đorđe i đak", "djordje i djak"],
    ["  How long\n does   SHIPPING take? ", "how long does shipping take?"],
    ["café naïve", "cafe naive"],
    ["", ""],
  ])("%j → %j", (input, expected) => {
    expect(normalizeForSearch(input)).toBe(expected);
  });

  it("makes typed-without-diacritics Serbian identical to the real spelling", () => {
    expect(normalizeForSearch("šta je rok za povraćaj")).toBe(
      normalizeForSearch("sta je rok za povracaj"),
    );
  });
});

describe("embedding text", () => {
  it("embeds the normalized question only", () => {
    expect(faqEmbeddingText({ question: " Koliko košta dostava? " })).toBe("koliko kosta dostava?");
    expect(queryEmbeddingText("KOLIKO  košta")).toBe("koliko kosta");
  });
});
