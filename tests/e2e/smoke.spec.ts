import { expect, test } from "@playwright/test";

test("home page renders the tagline", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Relay AI/);
  await expect(
    page.getByRole("heading", { name: "Answers first. Humans when it matters." }),
  ).toBeVisible();
});

test("health endpoint responds without caching", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  const body = await res.json();
  expect(body.status).toBe("ok");
});
