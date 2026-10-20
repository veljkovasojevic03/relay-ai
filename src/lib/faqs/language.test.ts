import { describe, expect, it } from "vitest";

import { detectLanguage } from "./language";

describe("detectLanguage", () => {
  it.each([
    ["Šta je rok za povraćaj?", "sr"],
    ["sta je rok za povracaj", "sr"],
    ["koliko traje dostava", "sr"],
    ["Da li radite nedeljom?", "sr"],
    ["How long does shipping take?", "en"],
    ["Can I return my order?", "en"],
    ["where is my order", "en"],
  ] as const)("%j → %s", (text, language) => {
    expect(detectLanguage(text, language === "sr" ? "en" : "sr")).toBe(language);
  });

  it("falls back when nothing gives the language away", () => {
    expect(detectLanguage("RLY-0042", "sr")).toBe("sr");
    expect(detectLanguage("", "en")).toBe("en");
    expect(detectLanguage("Nike Air 42", "en")).toBe("en");
  });
});
