import { expect, test } from "@playwright/test";

import { newCredentials, requireSupabase, signUp } from "./support/auth";
import { admin } from "./support/demo";

test.describe("plan and billing", () => {
  test.beforeEach(requireSupabase);

  test("shows the plan, usage meters, limit banners and the test-mode label", async ({ page }) => {
    test.setTimeout(60_000);
    const { email, password } = newCredentials();
    await signUp(page, "Mila", email, password);

    await page.getByRole("link", { name: "Plan & billing" }).first().click();
    await expect(page.getByRole("heading", { name: "Plan & billing", level: 1 })).toBeVisible();
    await expect(page.getByText("Demo — test mode, no real charges")).toBeVisible();
    await expect(page.getByRole("meter", { name: "Conversations" })).toHaveAttribute(
      "aria-valuetext",
      "0 of 50",
    );
    await expect(page.locator("[data-plan=free]")).toContainText("Your plan");
    await expect(page.locator("[data-plan=pro]")).toContainText("$19 a month (test mode)");
    // CI and local e2e run without Stripe keys.
    await expect(page.getByText("Billing isn't set up on this deployment.")).toBeVisible();

    // Near the monthly limit, then at it.
    const db = admin();
    const { data: profile } = await db
      .from("profiles")
      .select("id")
      .eq("notification_email", email)
      .single();
    const period = new Date().toISOString().slice(0, 7);
    await db
      .from("usage_counters")
      .upsert(
        { profile_id: profile!.id, period, conversations_started: 45 },
        { onConflict: "profile_id,period" },
      );
    await page.reload();
    await expect(page.getByText(/You've used 45 of 50 conversations this month/)).toBeVisible();

    await db
      .from("usage_counters")
      .update({ conversations_started: 50 })
      .eq("profile_id", profile!.id)
      .eq("period", period);
    await page.reload();
    await expect(page.getByRole("alert").filter({ hasText: "visitors see" })).toContainText(
      "You've used all 50 conversations this month.",
    );
  });
});
