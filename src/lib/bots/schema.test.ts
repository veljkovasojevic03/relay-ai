import { describe, expect, it } from "vitest";

import { fieldErrors } from "@/lib/validation/errors";

import { botFormSchema, parseFeaturedQuestions, parseGreeting, toBotColumns } from "./schema";

const valid = {
  name: "  Kroj Support ",
  description: "Clothing and shoes.",
  defaultLanguage: "sr",
  brandColor: "#B3472B",
  greetingEn: "Hi! How can I help?",
  greetingSr: "",
  position: "right",
  active: "on",
  allowedOrigins: JSON.stringify(["Kroj.rs/shop", "http://localhost:5500"]),
  featuredQuestions: JSON.stringify([{ language: "en", text: "Shipping time?" }]),
};

describe("botFormSchema", () => {
  it("normalizes a valid form into owner-writable columns", () => {
    const form = botFormSchema.parse(valid);
    expect(toBotColumns(form)).toEqual({
      name: "Kroj Support",
      description: "Clothing and shoes.",
      default_language: "sr",
      brand_color: "#b3472b",
      greeting: { en: "Hi! How can I help?" },
      position: "right",
      active: true,
      allowed_origins: ["https://kroj.rs", "http://localhost:5500"],
      featured_questions: [{ language: "en", text: "Shipping time?" }],
    });
  });

  it("treats a missing checkbox as inactive and missing lists as empty", () => {
    const { active, allowedOrigins, featuredQuestions, ...rest } = valid;
    void active;
    void allowedOrigins;
    void featuredQuestions;
    const form = botFormSchema.parse(rest);
    expect(form).toMatchObject({ active: false, allowedOrigins: [], featuredQuestions: [] });
  });

  it.each([
    [{ name: "" }, { name: "required" }],
    [{ name: "x".repeat(81) }, { name: "tooLong" }],
    [{ brandColor: "red" }, { brandColor: "invalidColor" }],
    [{ position: "top" }, { position: "required" }],
    [{ allowedOrigins: JSON.stringify(["http://kroj.rs"]) }, { allowedOrigins: "httpsRequired" }],
    [
      { allowedOrigins: JSON.stringify(["kroj.rs", "KROJ.rs"]) },
      { allowedOrigins: "duplicateOrigin" },
    ],
    [{ allowedOrigins: "not json" }, { allowedOrigins: "generic" }],
    [
      {
        featuredQuestions: JSON.stringify(
          Array.from({ length: 4 }, (_, i) => ({ language: "sr", text: `Q${i}` })),
        ),
      },
      { featuredQuestions: "tooManyQuestions" },
    ],
  ])("rejects %j", (patch, expected) => {
    const result = botFormSchema.safeParse({ ...valid, ...patch });
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!)).toEqual(expected);
  });
});

describe("jsonb readers", () => {
  it("drop anything that isn't the expected shape", () => {
    expect(parseGreeting({ en: "Hi", sr: 3, de: "Hallo" })).toEqual({ en: "Hi" });
    expect(parseGreeting(null)).toEqual({});
    expect(parseFeaturedQuestions([{ language: "xx", text: "?" }])).toEqual([]);
    expect(parseFeaturedQuestions([{ language: "sr", text: "Dostava?" }])).toEqual([
      { language: "sr", text: "Dostava?" },
    ]);
  });
});
