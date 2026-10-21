import { expect, test } from "@playwright/test";

import { requireSupabase } from "./support/auth";
import { admin } from "./support/demo";

test.describe("sandbox", () => {
  test.beforeEach(requireSupabase);

  test("two clicks from the landing page to a populated dashboard, then gone on request", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto("/en");
    await page.getByRole("link", { name: "Explore the dashboard" }).click();
    await expect(page).toHaveURL(/\/sandbox$/);
    await page.getByRole("button", { name: "Start exploring" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/You're exploring a sandbox with sample data/)).toBeVisible();
    await expect(page.getByText("2 unread")).toBeVisible();

    await page.goto("/en/dashboard/inbox");
    await expect(page.getByText("Super. Koliko dugo čuvate paket?")).toBeVisible();

    await page.goto("/en/dashboard/analytics");
    const conversations = page.locator("dt", { hasText: "Conversations" }).locator("+ dd");
    await expect(conversations).not.toHaveText("0");
    await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();

    await page.goto("/en/dashboard/bots");
    await page
      .getByRole("link", { name: /Kroj — moda i obuća/ })
      .first()
      .click();
    await page.getByRole("link", { name: "Knowledge" }).click();
    await expect(page.getByText("How long does delivery take?")).toBeVisible();

    // Ending the sandbox deletes the account right away.
    const { data: before } = await admin()
      .from("profiles")
      .select("id")
      .eq("is_sandbox", true)
      .order("created_at", { ascending: false })
      .limit(1);
    await page.getByRole("button", { name: "End sandbox and sign up" }).click();
    await expect(page).toHaveURL(/\/signup$/);
    const { data: after } = await admin().auth.admin.getUserById(before![0]!.id);
    expect(after.user).toBeNull();
  });
});
