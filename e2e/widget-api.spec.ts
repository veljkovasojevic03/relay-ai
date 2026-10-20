import { expect, test } from "@playwright/test";

import { requireSupabase } from "./support/auth";

// Route wiring only; behaviour is covered by tests/db/widget.test.ts against the same stack.
test.describe("widget API routes", () => {
  test.beforeEach(requireSupabase);

  test("answer preflights for the widget's method and headers", async ({ request }) => {
    const response = await request.fetch("/api/widget/message", {
      method: "OPTIONS",
      headers: { Origin: "https://shop.example", "Access-Control-Request-Method": "POST" },
    });
    expect(response.status()).toBe(204);
    expect(response.headers()["access-control-allow-headers"]).toContain("X-Relay-Token");
    expect(response.headers()["vary"]).toContain("Origin");
  });

  test("return clean JSON errors", async ({ request }) => {
    const unknownBot = await request.post("/api/widget/message", {
      data: { bot: "unknownbotkey00000", text: "hi" },
    });
    expect(unknownBot.status()).toBe(404);
    expect(await unknownBot.json()).toEqual({ error: "bot_not_found" });

    const malformed = await request.post("/api/widget/message", {
      data: "not json",
      headers: { "Content-Type": "application/json" },
    });
    expect(malformed.status()).toBe(400);

    for (const path of ["config", "poll"]) {
      const response = await request.get(`/api/widget/${path}?bot=unknownbotkey00000`);
      expect(response.status()).toBe(404);
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
  });
});
