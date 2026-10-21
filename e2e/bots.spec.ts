import { expect, test, type Page } from "@playwright/test";

import { newCredentials, requireSupabase, signOut, signUp } from "./support/auth";

// 1×1 transparent PNG.
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);
const SVG_AS_PNG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

async function createBot(page: Page, name: string) {
  await page.goto("/en/dashboard/bots/new");
  await page.getByLabel("Bot name").fill(name);
  await page.getByRole("button", { name: "Create bot" }).click();
  await expect(page).toHaveURL(/\/dashboard\/bots\/[0-9a-f-]{36}$/);
  // Next keeps the previous route's form mounted (hidden) for back navigation; start clean.
  await page.reload();
}

test.describe("bots", () => {
  test.beforeEach(requireSupabase);

  test.beforeEach(async ({ page }) => {
    const { email, password } = newCredentials();
    await signUp(page, "Mila", email, password);
  });

  test("create a bot with every setting, see it in the preview and the snippet", async ({
    page,
    context,
  }) => {
    await page.getByRole("link", { name: "Bots", exact: true }).click();
    await expect(page.getByRole("heading", { name: "No bots yet" })).toBeVisible();
    await page.getByRole("link", { name: "Create your first bot" }).click();

    await page.getByLabel("Bot name").fill("Kroj Support");
    await page.getByLabel("About your shop").fill("Clothing and shoes from Novi Sad.");
    await page.getByLabel("Default language").selectOption("sr");
    await page.getByRole("textbox", { name: "Brand color" }).fill("#1d4ed8");
    await page.getByRole("radio", { name: "Bottom left" }).check();
    await page.getByLabel("Greeting in Serbian").fill("Zdravo! Pitaj nas bilo šta.");

    const preview = page.getByRole("region", { name: "Preview" });
    await expect(preview.getByText("Kroj Support")).toBeVisible();
    await expect(preview.getByText("Zdravo! Pitaj nas bilo šta.")).toBeVisible();

    // Origins are normalized on entry; plain http is refused.
    const website = page.getByLabel("Allowed websites");
    await website.fill("http://kroj.rs");
    await page.getByRole("button", { name: "Add website" }).click();
    await expect(page.getByText("Use an https:// address")).toBeVisible();
    await website.fill("Kroj.rs/prodavnica");
    await website.press("Enter");
    await expect(page.getByRole("button", { name: "Remove https://kroj.rs" })).toBeVisible();

    await page.getByRole("button", { name: "Add question" }).click();
    await page.getByLabel("Question 1", { exact: true }).fill("Koliko traje dostava?");
    await expect(preview.getByText("Koliko traje dostava?")).toBeVisible();

    await page.getByRole("button", { name: "Create bot" }).click();
    await expect(page).toHaveURL(/\/dashboard\/bots\/[0-9a-f-]{36}$/);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Kroj Support" })).toBeVisible();

    // Everything was stored as entered (and normalized).
    await expect(page.getByLabel("About your shop")).toHaveValue(
      "Clothing and shoes from Novi Sad.",
    );
    await expect(page.getByLabel("Default language")).toHaveValue("sr");
    await expect(page.getByRole("radio", { name: "Bottom left" })).toBeChecked();
    await expect(page.getByLabel("Question 1", { exact: true })).toHaveValue(
      "Koliko traje dostava?",
    );

    const publicKey = await page.locator("code").first().textContent();
    expect(publicKey).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const snippet = page.getByTestId("embed-snippet");
    await expect(snippet).toContainText(`data-bot="${publicKey}"`);
    await expect(snippet).toContainText("/widget.js");

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copy snippet" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(publicKey!);
  });

  test("the Free plan stops at one bot", async ({ page }) => {
    await createBot(page, "Only bot");
    await page.goto("/en/dashboard/bots");
    await expect(page.getByText("1 of 1 bot on the Free plan")).toBeVisible();
    await expect(page.getByRole("note")).toContainText("The Free plan includes 1 bot");
    await expect(page.getByRole("link", { name: "New bot" })).toHaveCount(0);

    await page.goto("/en/dashboard/bots/new");
    await expect(page).toHaveURL(/\/dashboard\/bots$/);
  });

  test("edits persist and pausing shows in the list", async ({ page }) => {
    await createBot(page, "Draft");
    await page.getByLabel("Bot name").fill("Kroj");
    await page.getByRole("switch", { name: "Bot is active" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Bot name")).toHaveValue("Kroj");
    await expect(page.getByRole("switch", { name: "Bot is active" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await page.goto("/en/dashboard/bots");
    await expect(page.getByRole("link", { name: "Edit Kroj" })).toContainText("Paused");
  });

  test("validation errors keep what was typed", async ({ page }) => {
    await page.goto("/en/dashboard/bots/new");
    await page.getByRole("textbox", { name: "Brand color" }).fill("blue");
    await page.getByLabel("Greeting in English").fill("Hello!");
    await page.getByRole("button", { name: "Create bot" }).click();
    await expect(page.getByText("This field is required.")).toBeVisible();
    await expect(page.getByText("Use a hex color like #b3472b.")).toBeVisible();
    await expect(page.getByLabel("Greeting in English")).toHaveValue("Hello!");
  });

  test("logo upload checks the actual file bytes", async ({ page }) => {
    await createBot(page, "Logo bot");
    const input = page.getByLabel("Upload logo");

    await input.setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: SVG_AS_PNG });
    await page
      .getByRole("button", { name: "Upload logo", exact: true })
      .and(page.locator("button"))
      .click();
    await expect(page.getByText("Use a PNG, JPG or WebP image. SVG isn't allowed.")).toBeVisible();

    await input.setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await page
      .getByRole("button", { name: "Upload logo", exact: true })
      .and(page.locator("button"))
      .click();
    const logo = page.getByRole("img", { name: "Logo bot logo" });
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

    await page.getByRole("button", { name: "Remove logo" }).click();
    await expect(page.getByText("No logo yet.")).toBeVisible();
  });

  test("deleting asks first and frees the slot", async ({ page }) => {
    await createBot(page, "Temporary");
    await page.getByRole("button", { name: "Delete bot" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete “Temporary”?" });
    await dialog.getByRole("button", { name: "Keep it" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "Delete bot" }).click();
    await page.getByRole("button", { name: "Yes, delete it" }).click();
    await expect(page).toHaveURL(/\/dashboard\/bots$/);
    await expect(page.getByRole("heading", { name: "No bots yet" })).toBeVisible();
  });

  test("another owner cannot open the bot", async ({ page }) => {
    await createBot(page, "Private");
    const url = page.url();
    await signOut(page);

    const other = newCredentials();
    await signUp(page, "Bob", other.email, other.password);
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "We couldn't find that." })).toBeVisible();
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 360, height: 740 } });

    test("bot pages never scroll sideways", async ({ page }) => {
      await createBot(page, "A bot with a fairly long name for small screens");
      const bot = page.url();
      for (const path of [
        bot,
        `${bot}/knowledge`,
        `${bot}/playground`,
        "/en/dashboard/bots",
        "/en/dashboard",
        "/en/dashboard/billing",
      ]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), {
            message: `horizontal overflow on ${path}`,
          })
          .toBeLessThanOrEqual(0);
      }
    });
  });
});
