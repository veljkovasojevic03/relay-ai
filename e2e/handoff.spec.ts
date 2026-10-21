import { expect, test } from "@playwright/test";

import { newCredentials, requireSupabase, signUp } from "./support/auth";

const APP = "http://localhost:3100";
const HOST = "http://localhost:3101";

test.describe("handoff and live inbox", () => {
  test.beforeEach(requireSupabase);

  test("owner and visitor chat live, and a refresh on either side loses nothing", async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    // Owner: account and a bot allowed on the third-party page.
    const ownerContext = await browser.newContext();
    const owner = await ownerContext.newPage();
    const { email, password } = newCredentials();
    await signUp(owner, "Mila", email, password);
    await owner.goto("/en/dashboard/bots/new");
    await owner.getByLabel("Bot name").fill("Kroj Support");
    await owner.getByLabel("Allowed websites").fill(HOST);
    await owner.getByRole("button", { name: "Add website" }).click();
    await owner.getByRole("button", { name: "Create bot" }).click();
    await expect(owner).toHaveURL(/\/dashboard\/bots\/[0-9a-f-]{36}$/);
    await owner.reload();
    const key = (await owner.locator("code").first().textContent())!;

    // The owner watches the inbox; nothing is there yet.
    await owner.goto("/en/dashboard/inbox");
    await expect(owner.getByText("No conversations yet")).toBeVisible();
    await expect(owner.locator('[data-live="on"]:visible')).toBeVisible();

    // Visitor: a separate browser profile on the shop's page.
    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    await visitor.goto(`${HOST}/?bot=${key}&app=${encodeURIComponent(APP)}`);
    await visitor.getByRole("button", { name: "Open chat" }).click();
    const chat = visitor.getByRole("dialog", { name: "Chat with Kroj Support" });
    const input = chat.getByRole("textbox", { name: "Type your question…" });
    await input.fill("Can I talk to a human?");
    await input.press("Enter");
    await expect(chat.getByText(/will reply here as soon as they can/)).toBeVisible();
    await expect(chat.getByText("A person will reply here soon")).toBeVisible();

    // The optional email.
    await chat.getByRole("textbox", { name: "Your email (optional)" }).fill("not-an-email");
    await chat.getByRole("button", { name: "Save email" }).click();
    await expect(chat.getByText("That email doesn't look right.")).toBeVisible();
    await chat.getByRole("textbox", { name: "Your email (optional)" }).fill("visitor@kroj.test");
    await chat.getByRole("button", { name: "Save email" }).click();
    await expect(chat.getByText("Thanks! The answer will reach your inbox too.")).toBeVisible();

    // The owner's inbox updates by itself: the chat appears, waiting and unread.
    const link = owner.getByRole("link", { name: "Open the chat with visitor@kroj.test" });
    const row = owner.getByRole("listitem").filter({ has: link });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Waiting");
    await expect(owner.getByRole("link", { name: /^Inbox/ })).toContainText("1");

    // The owner answers; the visitor sees it without reloading.
    await link.click();
    await expect(owner.getByRole("heading", { name: "visitor@kroj.test" })).toBeVisible();
    await expect(owner.locator('[data-live="on"]:visible')).toBeVisible();
    await owner.getByLabel("Your reply").fill("Hi! Mila here. Your parcel ships today.");
    await owner.getByRole("button", { name: "Send reply" }).click();
    await expect(owner.getByText("Sent.")).toBeVisible();

    await expect(chat.getByText("Hi! Mila here. Your parcel ships today.")).toBeVisible();
    await expect(chat.getByText("Kroj Support team", { exact: true })).toBeVisible();
    await expect(chat.getByText("You're chatting with the Kroj Support team")).toBeVisible();

    // The visitor writes back; the owner's open chat shows it without reloading.
    await input.fill("Great, thank you!");
    await input.press("Enter");
    await expect(owner.getByText("Great, thank you!")).toBeVisible();

    // Refresh both sides: nothing is lost.
    await visitor.reload();
    await visitor.getByRole("button", { name: "Open chat" }).click();
    for (const text of [
      "Can I talk to a human?",
      "Hi! Mila here. Your parcel ships today.",
      "Great, thank you!",
    ]) {
      await expect(chat.getByText(text)).toBeVisible();
    }
    await owner.reload();
    for (const text of [
      "Can I talk to a human?",
      "Hi! Mila here. Your parcel ships today.",
      "Great, thank you!",
    ]) {
      await expect(owner.getByText(text)).toBeVisible();
    }

    // The owner resolves; the visitor's chat ends live.
    await owner.getByRole("button", { name: "Mark resolved" }).click();
    await expect(owner.getByText("This chat is resolved.")).toBeVisible();
    await expect(chat.getByText("This chat has ended.")).toBeVisible();

    await ownerContext.close();
    await visitorContext.close();
  });

  test("without a WebSocket the widget still gets the reply by polling", async ({ browser }) => {
    test.setTimeout(90_000);
    const ownerContext = await browser.newContext();
    const owner = await ownerContext.newPage();
    const { email, password } = newCredentials();
    await signUp(owner, "Mila", email, password);
    await owner.goto("/en/dashboard/bots/new");
    await owner.getByLabel("Bot name").fill("Kroj Support");
    await owner.getByLabel("Allowed websites").fill(HOST);
    await owner.getByRole("button", { name: "Add website" }).click();
    await owner.getByRole("button", { name: "Create bot" }).click();
    await expect(owner).toHaveURL(/\/dashboard\/bots\/[0-9a-f-]{36}$/);
    await owner.reload();
    const key = (await owner.locator("code").first().textContent())!;

    // The visitor's browser has no working WebSocket at all.
    const visitorContext = await browser.newContext();
    await visitorContext.addInitScript(() => {
      // @ts-expect-error -- simulating a network that blocks sockets
      window.WebSocket = undefined;
    });
    const visitor = await visitorContext.newPage();
    await visitor.goto(`${HOST}/?bot=${key}&app=${encodeURIComponent(APP)}`);
    await visitor.getByRole("button", { name: "Open chat" }).click();
    const chat = visitor.getByRole("dialog");
    const input = chat.getByRole("textbox", { name: "Type your question…" });
    await input.fill("I want to speak with a person");
    await input.press("Enter");
    await expect(chat.getByText("A person will reply here soon")).toBeVisible();

    await owner.goto("/en/dashboard/inbox?status=waiting_human");
    await owner.getByRole("link", { name: /^Open the chat with/ }).click();
    await owner.getByLabel("Your reply").fill("Polling works too.");
    await owner.getByRole("button", { name: "Send reply" }).click();

    // Polling runs every 5 seconds while the socket is unavailable.
    await expect(chat.getByText("Polling works too.")).toBeVisible({ timeout: 12_000 });
    await ownerContext.close();
    await visitorContext.close();
  });

  test("the inbox filters by status and opens only the owner's own chats", async ({ page }) => {
    const { email, password } = newCredentials();
    await signUp(page, "Mila", email, password);
    await page.goto("/en/dashboard/inbox?status=waiting_human");
    await expect(page.getByText("Nobody is waiting for you.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Waiting for you" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // A random or foreign id looks the same: not found.
    await page.goto("/en/dashboard/inbox/00000000-0000-4000-8000-000000000000");
    await expect(page.getByRole("heading", { name: "We couldn't find that." })).toBeVisible();
  });
});
