import { expect, test } from "@playwright/test";

import { requireSupabase } from "./support/auth";
import { ensureDemoBot } from "./support/demo";

test.describe("landing page", () => {
  test("sections, pricing, FAQ and the way in", async ({ page }) => {
    await page.goto("/en");
    for (const name of [
      "How it works",
      "Made for a shop run by one person",
      "Simple plans",
      "Questions you might have",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    await expect(page.getByText("Demo — test mode, no real charges")).toBeVisible();
    await expect(page.locator("#pricing")).toContainText("50 conversations a month");
    await expect(page.locator("#pricing")).toContainText("1,000 conversations a month");

    // FAQ answers open in place, without JavaScript.
    const faq = page.locator("details", { hasText: "Do I need an AI subscription or API key?" });
    await faq.locator("summary").click();
    await expect(faq).toContainText("nothing to pay per message");

    await expect(page.getByRole("link", { name: "Open the demo store" }).first()).toHaveAttribute(
      "href",
      "/demo",
    );
    await page.getByRole("link", { name: "Sign up free" }).first().click();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("link previews have an Open Graph image per language", async ({ page, request }) => {
    await page.goto("/sr");
    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(og).toMatch(/\/sr\/opengraph-image/);
    const res = await request.get(new URL(og!).pathname + new URL(og!).search);
    expect(res.headers()["content-type"]).toBe("image/png");
  });

  test.describe("live demo", () => {
    test.beforeEach(requireSupabase);

    test("the hero chat is the real widget, talking to the demo store's bot", async ({ page }) => {
      test.setTimeout(60_000);
      await ensureDemoBot();
      await page.goto("/en");

      const chat = page.getByTestId("landing-live-chat");
      // The widget mounts after the page goes idle and replaces the still picture.
      await expect(chat.getByRole("textbox", { name: "Type your question…" })).toBeVisible();
      await expect(chat.getByRole("button", { name: "Open chat" })).toHaveCount(0);

      await page.getByRole("button", { name: "Track my order" }).last().click();
      await expect(chat.getByRole("dialog").getByText(/What's your order number\?/)).toBeVisible();
    });
  });
});
