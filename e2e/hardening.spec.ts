// Phase 13 checks across the app: automated accessibility (axe, WCAG 2.x A/AA), keyboard
// basics, and the owner pages' Content Security Policy in a real browser.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { requireSupabase } from "./support/auth";
import { ensureDemoBot } from "./support/demo";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoAxeViolations(page: Page) {
  // axe also walks open shadow roots, so a mounted widget is checked along with the page.
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  const summary = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
  }));
  expect(summary, `${page.url()}\n${JSON.stringify(summary, null, 2)}`).toEqual([]);
}

/** Collects CSP violations reported by the browser while the test runs. */
function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  return violations;
}

test.describe("accessibility of public pages", () => {
  for (const path of ["/en", "/sr", "/en/login", "/en/signup", "/sr/sandbox", "/en/nope"]) {
    test(`axe finds nothing on ${path}`, async ({ page }) => {
      await page.goto(path);
      // Reveal animations finish instantly, so axe measures final colors.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expectNoAxeViolations(page);
    });
  }

  test("the demo store with the widget open, mid order lookup", async ({ page }) => {
    requireSupabase();
    test.setTimeout(60_000);
    await ensureDemoBot();
    await page.goto("/en/demo");
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Until the widget has loaded, the panel copies the question instead of asking it.
    await expect(page.getByRole("button", { name: "Open chat" })).toBeVisible();
    await page
      .getByRole("complementary", { name: "Try these" })
      .getByRole("button", { name: /^Track my order/ })
      .click();
    const chat = page.getByRole("dialog", { name: /^Chat with/ });
    await expect(chat.getByText(/What's your order number\?/)).toBeVisible();
    const input = chat.getByRole("textbox", { name: "Type your question…" });
    await input.fill("KR-10482");
    await input.press("Enter");
    await expect(chat.getByText("And the email address you used for the order?")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("the first Tab reaches a working skip link", async ({ page }) => {
    await page.goto("/en/login");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  });

  test("the sign-in form works from the keyboard alone", async ({ page }) => {
    await page.goto("/en/login");
    await page.getByLabel("Email").focus();
    await page.keyboard.type("nobody@relay.test");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  });
});

test.describe("owner pages", () => {
  test("sign-in pages send a nonce CSP that the page itself satisfies", async ({ page }) => {
    const violations = watchCsp(page);
    const res = await page.goto("/en/login");
    const csp = res?.headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("frame-ancestors 'none'");

    const nonce = /'nonce-([^']+)'/.exec(csp)![1];
    // Every script Next.js rendered carries this request's nonce.
    const scripts = await page
      .locator("script")
      .evaluateAll((els) => els.map((el) => (el as HTMLScriptElement).nonce));
    expect(scripts.length).toBeGreaterThan(0);
    expect(new Set(scripts)).toEqual(new Set([nonce]));

    // The form hydrated (React ran under the policy) and nothing was blocked.
    await page.getByLabel("Email").fill("x@relay.test");
    await expect(page.getByLabel("Email")).toHaveValue("x@relay.test");
    expect(violations).toEqual([]);

    // A fresh nonce on every request.
    const again = await page.request.get("/en/login");
    expect(again.headers()["content-security-policy"]).not.toContain(`'nonce-${nonce}'`);
  });

  test("marketing pages stay static, without the per-request policy", async ({ request }) => {
    const res = await request.get("/en");
    expect(res.headers()["content-security-policy"]).toBeUndefined();
  });

  test("a populated dashboard: no CSP violations, no axe violations", async ({ page }) => {
    requireSupabase();
    test.setTimeout(120_000);
    const violations = watchCsp(page);

    // A sandbox fills every page with data (bot, FAQs, inbox, analytics).
    await page.goto("/en/sandbox");
    await page.getByRole("button", { name: "Start exploring" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expectNoAxeViolations(page);

    await page.goto("/en/dashboard/bots");
    await page
      .getByRole("link", { name: /Kroj — moda i obuća/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/dashboard\/bots\/[0-9a-f-]{36}$/);
    const bot = page.url();
    // The settings page loads the real widget for its preview (via 'strict-dynamic').
    await expect.poll(() => page.evaluate(() => "RelayAI" in window)).toBe(true);

    for (const path of [
      bot,
      `${bot}/knowledge`,
      `${bot}/playground`,
      `${bot}/actions`,
      "/en/dashboard/inbox",
      "/en/dashboard/analytics",
      "/en/dashboard/events",
      "/en/dashboard/billing",
      "/en/dashboard/account",
    ]) {
      await page.goto(path);
      await expect(page.locator("main#main h1").first()).toBeVisible();
      await expectNoAxeViolations(page);
    }

    // Realtime (wss to Supabase) and the API calls all passed the policy.
    expect(violations).toEqual([]);
  });
});
