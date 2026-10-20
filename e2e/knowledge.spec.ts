import { expect, test, type Page } from "@playwright/test";

import { newCredentials, requireSupabase, signUp } from "./support/auth";

async function createBot(page: Page, name: string) {
  await page.goto("/en/dashboard/bots/new");
  await page.getByLabel("Bot name").fill(name);
  await page.getByRole("button", { name: "Create bot" }).click();
  await expect(page).toHaveURL(/\/dashboard\/bots\/[0-9a-f-]{36}$/);
  await page.reload();
}

// The embed Edge Function may or may not be running (CI starts the stack without it), so
// assertions accept both outcomes: indexed, or saved with a clear "not indexed" state.
test.describe("knowledge and playground", () => {
  test.beforeEach(requireSupabase);

  test.beforeEach(async ({ page }) => {
    const { email, password } = newCredentials();
    await signUp(page, "Mila", email, password);
    await createBot(page, "Kroj Support");
  });

  test("starter set, add, import, edit, filter and delete questions", async ({ page }) => {
    await page.getByRole("link", { name: "Knowledge" }).click();
    await expect(
      page.getByRole("heading", { name: "Teach your bot its first answers" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Add 3 starter questions" }).click();
    await expect(
      page.getByText("Starter questions added").or(page.getByText("indexing failed")),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "3 questions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Search index" })).toBeVisible();

    // Add one by hand; validation runs on the server.
    await page.getByRole("button", { name: "Add question" }).click();
    await page.getByRole("button", { name: "Add question" }).last().click();
    await expect(page.getByText("This field is required.").first()).toBeVisible();
    await page
      .getByRole("textbox", { name: "Question", exact: true })
      .fill("Do you sell gift cards?");
    await page.getByRole("textbox", { name: "Answer", exact: true }).fill("Yes, from 2,000 RSD.");
    await page.getByRole("checkbox", { name: /^Featured/ }).check();
    await page.getByRole("button", { name: "Add question" }).last().click();
    await expect(page.getByRole("heading", { name: "4 questions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Do you sell gift cards?" })).toBeVisible();

    // Quick import with a live preview; Serbian markers and language.
    await page.getByRole("button", { name: "Quick import" }).click();
    await page
      .getByLabel("Questions to import")
      .fill("P: Da li radite nedeljom?\nO: Ne, nedeljom ne radimo.\n\nP: Gde ste?\nO: U Beogradu.");
    await page.getByLabel("Language of these questions").selectOption("sr");
    await expect(page.getByText("2 questions ready to import")).toBeVisible();
    await page.getByRole("button", { name: "Import 2 questions" }).click();
    await expect(page.getByRole("heading", { name: "6 questions" })).toBeVisible();

    // Filter by language.
    await page.getByRole("button", { name: "Srpski (2)" }).click();
    await expect(page.getByRole("heading", { name: "Da li radite nedeljom?" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Do you sell gift cards?" })).toBeHidden();
    await page.getByRole("button", { name: "All languages" }).click();

    // Edit in place.
    await page.getByRole("button", { name: "Edit “Gde ste?”" }).click();
    await page
      .getByRole("textbox", { name: "Question", exact: true })
      .fill("Gde se nalazi prodavnica?");
    await page.getByRole("button", { name: "Save question" }).click();
    await expect(page.getByRole("heading", { name: "Gde se nalazi prodavnica?" })).toBeVisible();

    // Delete with confirmation.
    await page.getByRole("button", { name: "Delete “Do you sell gift cards?”" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "5 questions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Do you sell gift cards?" })).toBeHidden();

    // Everything survives a reload.
    await page.reload();
    await expect(page.getByRole("heading", { name: "5 questions" })).toBeVisible();
  });

  test("the playground shows matches and the reply the bot would give", async ({ page }) => {
    await page.getByRole("link", { name: "Test your bot" }).click();
    await expect(page.getByText("Add a few questions under Knowledge first")).toBeVisible();

    await page.getByRole("link", { name: "Knowledge" }).first().click();
    await page.getByRole("button", { name: "Add 3 starter questions" }).click();
    await expect(page.getByRole("heading", { name: "3 questions" })).toBeVisible();

    await page.getByRole("link", { name: "Test your bot" }).click();
    await page.getByLabel("Customer question").fill("How long does delivery take?");
    await page.getByRole("button", { name: "Ask" }).click();

    const reply = page.getByRole("region", { name: "The bot would reply" });
    await expect(reply).toBeVisible();
    await expect(reply.getByText("Language: English (detected)")).toBeVisible();
    // Indexed: an exact question answers. Not indexed: keyword search only, and it says so.
    await expect(
      reply
        .getByText("Answered from: How long does delivery take?")
        .or(reply.getByText(/only keyword matching ran/)),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Matched questions" })).toContainText(
      "How long does delivery take?",
    );

    // One-click examples submit right away.
    await page.getByRole("button", { name: "Can I return an item?" }).click();
    await expect(reply).toContainText("Can I return an item?");
  });
});
