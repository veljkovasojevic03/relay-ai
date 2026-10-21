import { expect, test } from "@playwright/test";

import { requireSupabase } from "./support/auth";
import { ensureDemoBot } from "./support/demo";

test.describe("demo store", () => {
  test.beforeEach(requireSupabase);

  test("the Try these panel drives the real widget through an order lookup", async ({ page }) => {
    test.setTimeout(60_000);
    await ensureDemoBot();

    await page.goto("/demo");
    await expect(
      page.getByRole("heading", { name: "Sewn in Serbia. Worn everywhere.", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(/Kroj is fictional and nothing here is for sale/)).toBeVisible();

    // The widget comes from the real script tag.
    await expect(page.getByRole("button", { name: "Open chat" })).toBeVisible();

    const panel = page.getByRole("complementary", { name: "Try these" });
    await panel.getByRole("button", { name: /^Track my order/ }).click();
    const chat = page.getByRole("dialog", { name: "Chat with Kroj — moda i obuća" });
    await expect(chat.getByText(/What's your order number\?/)).toBeVisible();

    const input = chat.getByRole("textbox", { name: "Type your question…" });
    await input.fill("KR-10482");
    await input.press("Enter");
    await expect(chat.getByText("And the email address you used for the order?")).toBeVisible();
    await input.fill("marko@example.com");
    await input.press("Enter");
    await chat
      .getByRole("group", { name: "Look up this order?" })
      .getByRole("button", { name: "Confirm" })
      .click();
    await expect(chat.getByText(/Order KR-10482 is on its way\./)).toBeVisible();
  });

  test("Serbian store, Serbian questions", async ({ page }) => {
    await ensureDemoBot();
    await page.goto("/sr/demo");
    await expect(
      page.getByRole("heading", { name: "Sašiveno u Srbiji. Nosi se svuda.", level: 1 }),
    ).toBeVisible();
    const panel = page.getByRole("complementary", { name: "Probaj ovo" });
    await expect(panel.getByRole("button", { name: /^Prati moju porudžbinu/ })).toBeVisible();
    await panel.getByRole("button", { name: "English" }).click();
    await expect(panel.getByRole("button", { name: /^Track my order/ })).toBeVisible();
  });
});
