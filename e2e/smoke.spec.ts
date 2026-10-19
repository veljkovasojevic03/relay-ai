import { expect, test } from "@playwright/test";

test("English home page renders at /", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Relay AI/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { level: 1, name: "Answers first. Humans when it matters." }),
  ).toBeVisible();
});

test("Serbian home page renders at /sr", async ({ page }) => {
  await page.goto("/sr");
  await expect(page.locator("html")).toHaveAttribute("lang", "sr");
  await expect(
    page.getByRole("heading", { level: 1, name: "Prvo odgovor. Čovek kad je bitno." }),
  ).toBeVisible();
});

test("language switcher moves between locales", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Srpski" }).click();
  await expect(page).toHaveURL(/\/sr$/);
  await expect(page.getByRole("link", { name: "Srpski" })).toHaveAttribute("aria-current", "true");
  await page.getByRole("link", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("unknown paths show the localized not-found page", async ({ page }) => {
  const res = await page.goto("/sr/nema-ovoga");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Ova stranica ne postoji" })).toBeVisible();
});

test("health endpoint responds without caching", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  const body = await res.json();
  expect(["ok", "degraded"]).toContain(body.status);
});

test("cron tick rejects unauthenticated calls", async ({ request }) => {
  const res = await request.post("/api/cron/tick", {
    headers: { authorization: "Bearer wrong-secret" },
  });
  // 401 when CRON_SECRET is set, 503 when it isn't configured. Never 200.
  expect([401, 503]).toContain(res.status());
});
