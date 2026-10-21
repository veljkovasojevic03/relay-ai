import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { seedAnalytics } from "../src/lib/demo/analytics-seed";

import { newCredentials, requireSupabase, signUp } from "./support/auth";

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

test.describe("analytics and unknown questions", () => {
  test.beforeEach(requireSupabase);

  test("charts from seeded history, and one click from an unknown question to an FAQ", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const { email, password } = newCredentials();
    await signUp(page, "Mila", email, password);

    // Empty state before any bot exists.
    await page.goto("/en/dashboard/analytics");
    await expect(page.getByText("Create a bot first.")).toBeVisible();

    await page.goto("/en/dashboard/bots/new");
    await page.getByLabel("Bot name").fill("Kroj Support");
    await page.getByRole("button", { name: "Create bot" }).click();
    await expect(page).toHaveURL(/\/dashboard\/bots\/([0-9a-f-]{36})$/);
    const botId = /bots\/([0-9a-f-]{36})$/.exec(page.url())![1]!;
    const seeded = await seedAnalytics(admin(), botId, { days: 30, seed: 3 });

    await page.goto("/en/dashboard/analytics");
    await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
    // The tiles show the seeded total for the default 30 days.
    const conversations = page.locator("dt", { hasText: "Conversations" }).locator("+ dd");
    await expect(conversations).toHaveText(String(seeded.conversations));
    await expect(page.locator("dt", { hasText: "Answered by the bot alone" })).toBeVisible();
    await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();

    // The numbers behind the chart are available as a table.
    await page.getByText("Show as a table").click();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(30);

    // A shorter range.
    await page.getByRole("link", { name: "7 days" }).click();
    await expect(page).toHaveURL(/days=7/);
    await expect(page.getByText("Last 7 days")).toBeVisible();

    // The most-asked unknown question has the owner's reply as its draft.
    await page.getByRole("link", { name: "30 days" }).click();
    const item = page.locator("li", { hasText: "Do you have sneakers in size 52?" }).first();
    await expect(item).toContainText("Draft from your reply");
    await expect(item).toContainText(/Asked \d+ times/);
    await item.getByRole("link", { name: "Add to FAQ" }).click();

    // The FAQ form opens prefilled: the question and the human reply as the answer.
    await expect(page).toHaveURL(/\/knowledge\?fromUnknown=/);
    await expect(page.getByRole("textbox", { name: "Question", exact: true })).toHaveValue(
      "Do you have sneakers in size 52?",
    );
    await expect(page.getByRole("textbox", { name: "Answer", exact: true })).toHaveValue(
      "Not at the moment, but size 50–52 arrives next month.",
    );
    await page.locator("form").getByRole("button", { name: "Add question" }).click();
    await expect(page.getByText("Do you have sneakers in size 52?").first()).toBeVisible();

    // Back in Analytics, every repeat of that question is gone from the open list.
    await page.goto("/en/dashboard/analytics");
    await expect(page.getByText("Do you have sneakers in size 52?")).toHaveCount(0);

    // Dismissing removes a question too.
    const another = page.locator("li", { hasText: "Can I pay with crypto?" }).first();
    await another.getByRole("button", { name: /Dismiss/ }).click();
    await expect(page.getByText("Can I pay with crypto?")).toHaveCount(0);
  });

  test("the weekly digest is a profile setting", async ({ page }) => {
    const { email, password } = newCredentials();
    await signUp(page, "Mila", email, password);
    await page.goto("/en/dashboard/account");
    const digest = page.getByRole("checkbox", { name: "Weekly summary email" });
    await expect(digest).not.toBeChecked();
    await digest.check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Weekly summary email" })).toBeChecked();
  });
});
