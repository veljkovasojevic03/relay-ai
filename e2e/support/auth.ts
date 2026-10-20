// Helpers use explicit /en/ paths: an earlier visit to a /sr page leaves a Serbian locale cookie.
import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

/** Auth journeys need a Supabase stack; run them with `pnpm e2e:local` (CI always does). */
// Only ever the local stack: these tests create accounts and read the local mail catcher.
export const hasSupabase = /^http:\/\/(127\.0\.0\.1|localhost):/.test(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
);
export const requireSupabase = () =>
  test.skip(!hasSupabase, "needs local Supabase (pnpm e2e:local)");

export const newCredentials = () => ({
  email: `e2e-${randomUUID().slice(0, 8)}@relay.test`,
  password: `pw-${randomUUID()}`,
});

/** Submits the sign-up form and waits for the "check your inbox" state. */
export async function requestSignUp(page: Page, name: string, email: string, password: string) {
  await page.goto("/en/signup");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your inbox");
}

/** Full sign-up like production: form, confirmation email, link opened in the same browser. */
export async function signUp(page: Page, name: string, email: string, password: string) {
  await requestSignUp(page, name, email, password);
  const mail = await latestEmailTo(email);
  await page.goto(firstLink(mail.text || mail.html));
  await expect(page).toHaveURL(/\/dashboard$/);
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs out and waits until the session is really gone (the redirect lands on login). */
export async function signOut(page: Page, label = "Sign out") {
  await page.getByRole("button", { name: label }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** The form-level alert (Next.js also renders an empty role=alert route announcer). */
export const formAlert = (page: Page) => page.locator('[data-slot="alert"]');

/** Latest message Mailpit (Supabase's local inbox) received for `to`. */
export async function latestEmailTo(to: string): Promise<{ html: string; text: string }> {
  const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
        const body = (await res.json()) as { messages: { ID: string }[] };
        id = body.messages[0]?.ID;
        return id;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();
  const res = await fetch(`${mailpit}/api/v1/message/${id}`);
  const message = (await res.json()) as { HTML: string; Text: string };
  return { html: message.HTML, text: message.Text };
}

export function firstLink(text: string): string {
  const match = /https?:\/\/[^\s"'<>)\]]+/.exec(text);
  if (!match) throw new Error("No link in email");
  return match[0].replaceAll("&amp;", "&");
}
