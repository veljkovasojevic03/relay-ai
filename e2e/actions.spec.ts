import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { newCredentials, requireSupabase, signUp } from "./support/auth";

const APP = "http://localhost:3100";
const HOST = "http://localhost:3101";

/** Owners can't set `is_demo`; the test marks its own bot, as `pnpm demo:mark-bot` does. */
async function markDemo(publicKey: string) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { error } = await db.from("bots").update({ is_demo: true }).eq("public_key", publicKey);
  if (error) throw error;
}

test.describe("actions (simulated n8n)", () => {
  test.beforeEach(requireSupabase);

  test("owner switches actions on; a visitor tracks an order and files a ticket", async ({
    browser,
  }) => {
    test.setTimeout(120_000);

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

    // Order status is for the demo bot only; tickets are for everyone.
    await owner.getByRole("link", { name: "Actions" }).click();
    await expect(owner.getByRole("switch", { name: "Order status" })).toBeDisabled();
    await expect(owner.getByText("No actions have run yet.")).toBeVisible();
    await owner.getByRole("switch", { name: "Create a ticket" }).click();
    await expect(owner.getByRole("switch", { name: "Create a ticket" })).toBeChecked();

    await markDemo(key);
    await owner.reload();
    await owner.getByRole("switch", { name: "Order status" }).click();
    await expect(owner.getByRole("switch", { name: "Order status" })).toBeChecked();

    // Visitor on the third-party shop.
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(`${HOST}/?bot=${key}&app=${encodeURIComponent(APP)}`);
    await visitor.getByRole("button", { name: "Open chat" }).click();
    const chat = visitor.getByRole("dialog", { name: "Chat with Kroj Support" });
    const input = chat.getByRole("textbox", { name: "Type your question…" });

    await chat.getByRole("button", { name: "Track my order" }).click();
    await expect(chat.getByText(/What's your order number\?/)).toBeVisible();
    await input.fill("kr-10482");
    await input.press("Enter");
    await expect(chat.getByText("And the email address you used for the order?")).toBeVisible();
    await input.fill("marko@example.com");
    await input.press("Enter");

    const card = chat.getByRole("group", { name: "Look up this order?" });
    await expect(card).toContainText("KR-10482");
    await expect(card).toContainText("marko@example.com");
    await card.getByRole("button", { name: "Confirm" }).click();
    await expect(chat.getByText(/Order KR-10482 is on its way\./)).toBeVisible();
    await expect(card.getByRole("button", { name: "Confirm" })).toHaveCount(0);

    // A ticket, skipping the optional email with the quick reply.
    await input.fill("I want to report a problem");
    await input.press("Enter");
    await expect(chat.getByText(/what's the problem\?/)).toBeVisible();
    await input.fill("Wrong size <b>sent</b>");
    await input.press("Enter");
    await input.fill("Got 41 instead of 42 & the box was open.");
    await input.press("Enter");
    await chat.getByRole("button", { name: "Skip" }).click();
    const ticket = chat.getByRole("group", { name: "Send this ticket to the team?" });
    // Visitor text is shown as text, never as markup.
    await expect(ticket).toContainText("Wrong size <b>sent</b>");
    await ticket.getByRole("button", { name: "Confirm" }).click();
    await expect(chat.getByText(/Your ticket number is RLY-\d{4}\./)).toBeVisible();

    // The owner sees the runs and the simulated events.
    await owner.reload();
    await expect(owner.getByText("Succeeded")).toHaveCount(2);
    await owner.goto("/en/dashboard/events");
    await expect(owner.getByText(/Simulated mode/)).toBeVisible();
    await expect(owner.getByText("Order status lookup")).toBeVisible();
    await expect(owner.getByText("New ticket")).toBeVisible();
    await expect(owner.getByText("Simulated: computed in the app instead of n8n.")).toHaveCount(2);
  });
});
