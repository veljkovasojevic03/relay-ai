import { expect, test, type Page } from "@playwright/test";

import { newCredentials, requireSupabase, signUp } from "./support/auth";

const APP = "http://localhost:3100";
const HOST = "http://localhost:3101";

/** Bot with three starter FAQs; `origin` is added to its allowed websites when given. */
async function createBot(page: Page, origin?: string): Promise<string> {
  await page.goto("/en/dashboard/bots/new");
  await page.getByLabel("Bot name").fill("Kroj Support");
  await page.getByLabel("Greeting in English").fill("Hi! Ask me about delivery or returns.");
  if (origin) {
    await page.getByLabel("Allowed websites").fill(origin);
    await page.getByRole("button", { name: "Add website" }).click();
  }
  await page.getByRole("button", { name: "Create bot" }).click();
  await expect(page).toHaveURL(/\/dashboard\/bots\/[0-9a-f-]{36}$/);
  await page.reload();
  const key = (await page.locator("code").first().textContent())!;

  await page.getByRole("link", { name: "Knowledge" }).click();
  await page.getByRole("button", { name: "Add 3 starter questions" }).click();
  await expect(page.getByRole("heading", { name: "3 questions" })).toBeVisible();
  return key;
}

const hostPage = (key: string) => `${HOST}/?bot=${key}&app=${encodeURIComponent(APP)}`;

// Without the embed Edge Function (CI) the bot can't look answers up and says so; with it
// (local `pnpm db:start:embed`) it answers from the FAQ. Both are real streamed replies.
const REPLY = /Orders usually ship|can't look that up right now/;

test.describe("widget on a third-party page", () => {
  test.beforeEach(requireSupabase);

  test("opens, answers, survives a refresh, and ignores the host's CSS", async ({ page }) => {
    const { email, password } = newCredentials();
    await signUp(page, "Mila", email, password);
    const key = await createBot(page, HOST);

    await page.goto(hostPage(key));
    const launcher = page.getByRole("button", { name: "Open chat" });
    await expect(launcher).toBeVisible();

    // The hostile stylesheet reaches neither the host element nor anything inside.
    const style = await launcher.evaluate((el) => {
      const s = getComputedStyle(el);
      const host = (el.getRootNode() as ShadowRoot).host;
      const h = getComputedStyle(host);
      return {
        background: s.backgroundColor,
        width: s.width,
        hostDisplay: h.display,
        hostVisibility: h.visibility,
        hostOpacity: h.opacity,
      };
    });
    expect(style).toEqual({
      background: "rgb(179, 71, 43)",
      width: "56px",
      hostDisplay: "block",
      hostVisibility: "visible",
      hostOpacity: "1",
    });

    await launcher.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Chat with Kroj Support" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Hi! Ask me about delivery or returns.")).toBeVisible();
    const bubbleFont = await dialog
      .getByText("Hi! Ask me about delivery or returns.")
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return { size: s.fontSize, color: s.color, family: s.fontFamily };
      });
    expect(bubbleFont.size).toBe("15px");
    expect(bubbleFont.color).not.toBe("rgb(255, 0, 0)");
    expect(bubbleFont.family).not.toContain("Comic Sans");

    // Focus moves into the panel; ask by typing and Enter.
    const input = dialog.getByRole("textbox", { name: "Type your question…" });
    await expect(input).toBeFocused();
    await input.fill("How long does delivery take?");
    await input.press("Enter");
    await expect(dialog.getByText("How long does delivery take?").first()).toBeVisible();
    await expect(dialog.getByText(REPLY)).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText("Sample", { exact: true }).first()).toBeVisible();

    // The token is the only thing stored, namespaced per bot.
    const stored = await page.evaluate(() => Object.keys(localStorage));
    expect(stored).toEqual([`relay-ai:v1:${key}:token`]);

    // A refresh resumes the same conversation.
    await page.reload();
    await page.getByRole("button", { name: "Open chat" }).click();
    await expect(dialog.getByText("How long does delivery take?")).toBeVisible();
    await expect(dialog.getByText(REPLY)).toBeVisible();

    // Escape closes and returns focus to the launcher.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Open chat" })).toBeFocused();

    // End the chat and rate it.
    await page.getByRole("button", { name: "Open chat" }).click();
    await dialog.getByRole("button", { name: "End chat" }).click();
    await expect(dialog.getByText("This chat has ended.")).toBeVisible();
    await dialog.getByRole("button", { name: "Helpful", exact: true }).click();
    await expect(dialog.getByText("Thanks for the feedback!")).toBeVisible();
    await dialog.getByRole("button", { name: "Start a new chat" }).click();
    await expect(input).toBeEnabled();
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  });

  test("keeps focus inside the open panel", async ({ page }) => {
    const { email, password } = newCredentials();
    await signUp(page, "Mila", email, password);
    const key = await createBot(page, HOST);
    await page.goto(hostPage(key));
    await page.getByRole("button", { name: "Open chat" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const host = document.querySelector("relay-ai-widget");
        const active = host?.shadowRoot?.activeElement;
        return Boolean(active && active.closest(".panel"));
      });
      expect(inside).toBe(true);
    }
  });

  test("stays hidden on a website that isn't allowed", async ({ page }) => {
    const { email, password } = newCredentials();
    await signUp(page, "Mila", email, password);
    const key = await createBot(page);

    const warnings: string[] = [];
    page.on("console", (m) => m.type() === "warning" && warnings.push(m.text()));
    await page.goto(hostPage(key));
    await expect.poll(() => warnings.join(" ")).toContain("allowed websites");
    await expect(page.getByRole("button", { name: "Open chat" })).toHaveCount(0);
  });

  test("the dashboard preview is the real widget with the draft settings", async ({ page }) => {
    const { email, password } = newCredentials();
    await signUp(page, "Mila", email, password);
    await page.goto("/en/dashboard/bots/new");
    await page.getByLabel("Bot name").fill("Draft Bot");
    const preview = page.getByTestId("widget-preview");
    await expect(preview.getByRole("heading", { name: "Draft Bot" })).toBeVisible();

    await page.getByLabel("Greeting in English").fill("Draft greeting");
    await expect(preview.getByText("Draft greeting")).toBeVisible();
    // Sending is off in the preview.
    await expect(preview.getByRole("textbox")).toBeDisabled();
  });
});
