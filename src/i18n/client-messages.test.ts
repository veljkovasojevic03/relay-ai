import { describe, expect, it } from "vitest";

import en from "../../messages/en.json" with { type: "json" };

import { pickMessages, PUBLIC_CLIENT_MESSAGES } from "./client-messages";

describe("pickMessages", () => {
  it("copies whole namespaces and dotted sub-paths only", () => {
    const picked = pickMessages(en, ["Locale", "Home.hero.demo"]);
    expect(picked).toEqual({ Locale: en.Locale, Home: { hero: { demo: en.Home.hero.demo } } });
  });

  it("names only paths that exist, and leaves the dashboard copy out", () => {
    const picked = pickMessages(en, PUBLIC_CLIENT_MESSAGES);
    for (const path of PUBLIC_CLIENT_MESSAGES) {
      const value = path
        .split(".")
        .reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], picked);
      expect({ path, found: value !== undefined }).toEqual({ path, found: true });
    }
    expect(Object.keys(picked)).not.toContain("Dashboard");
    expect(JSON.stringify(picked).length).toBeLessThan(JSON.stringify(en).length / 2);
  });
});
