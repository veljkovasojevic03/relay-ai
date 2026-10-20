import { expect, test } from "@playwright/test";

import {
  firstLink,
  formAlert,
  latestEmailTo,
  newCredentials,
  requestSignUp,
  requireSupabase,
  signIn,
  signOut,
  signUp,
} from "./support/auth";

test.describe("owner authentication", () => {
  test.beforeEach(requireSupabase);

  test("protected pages send signed-out visitors to sign in and back", async ({ page }) => {
    await page.goto("/dashboard/account");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Faccount$/);

    const { email, password } = newCredentials();
    await signUp(page, "Mila", email, password);
    await signOut(page);
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/dashboard/account");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  });

  test("sign-up lands on a personal dashboard; guests pages bounce back", async ({ page }) => {
    const { email, password } = newCredentials();
    await signUp(page, "Mila", email, password);
    await expect(page.getByRole("heading", { level: 1, name: "Hi, Mila" })).toBeVisible();
    await expect(page.getByText("Plan: Free")).toBeVisible();

    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("a confirmation link opened in another browser confirms and asks to sign in", async ({
    page,
    browser,
  }) => {
    const { email, password } = newCredentials();
    await requestSignUp(page, "Mila", email, password);
    const mail = await latestEmailTo(email);

    const other = await (await browser.newContext()).newPage();
    await other.goto(firstLink(mail.text || mail.html));
    await expect(other).toHaveURL(/\/login\?notice=emailConfirmed$/);
    await expect(other.getByRole("status")).toHaveText(
      "Your email is confirmed. Sign in to continue.",
    );
    await expect(formAlert(other)).toHaveCount(0);

    await signIn(other, email, password);
    await expect(other).toHaveURL(/\/dashboard$/);
  });

  test("signing in before confirming explains what to do", async ({ page }) => {
    const { email, password } = newCredentials();
    await requestSignUp(page, "Mila", email, password);
    await signIn(page, email, password);
    await expect(formAlert(page)).toHaveText(
      "Confirm your email first. Check your inbox for the link.",
    );
  });

  test("wrong password and invalid fields show accessible errors", async ({ page }) => {
    await signIn(page, "nobody@relay.test", "definitely-wrong");
    await expect(formAlert(page)).toHaveText("That email and password don't match.");
    await expect(page.getByLabel("Email")).toHaveValue("nobody@relay.test");

    await page.goto("/signup");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  });

  test("profile edits persist and the language preference switches the dashboard", async ({
    page,
  }) => {
    const { email, password } = newCredentials();
    await signUp(page, "Mila", email, password);
    await page.getByRole("link", { name: "Account", exact: true }).click();

    await page.getByLabel("Display name").fill("Mila Petrović");
    await page.getByLabel("Notification email").fill("alerts@kroj.test");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");

    await page.reload();
    await expect(page.getByLabel("Display name")).toHaveValue("Mila Petrović");
    await expect(page.getByLabel("Notification email")).toHaveValue("alerts@kroj.test");

    await page.getByLabel("Dashboard language").selectOption("sr");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/sr\/dashboard\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: "Nalog" })).toBeVisible();

    // The saved language wins on the next sign-in, whatever page they sign in from.
    await signOut(page, "Odjavi se");
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/sr\/dashboard$/);
  });

  test("password reset by email link", async ({ page }) => {
    const { email, password } = newCredentials();
    await signUp(page, "Mila", email, password);
    await signOut(page);

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("a reset link is on its way");

    const mail = await latestEmailTo(email);
    await page.goto(firstLink(mail.text || mail.html));
    await expect(page).toHaveURL(/\/reset-password$/);

    const newPassword = `new-${password}`;
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page.getByLabel("Repeat password").fill(newPassword);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await signOut(page);
    await signIn(page, email, newPassword);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("forgot password does not reveal whether an account exists", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("no-such-owner@relay.test");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("If there's an account");
  });

  test("a used or bogus reset link explains what to do", async ({ page }) => {
    await page.goto("/api/auth/callback?code=bogus&next=%2Freset-password");
    await expect(page).toHaveURL(/\/login\?error=linkInvalid$/);
    await expect(formAlert(page)).toContainText("invalid or has expired");

    await page.goto("/reset-password");
    await expect(
      page.getByRole("alert").filter({ hasText: "This reset link has expired" }),
    ).toBeVisible();
  });

  test("callback never redirects off-site", async ({ page }) => {
    await page.goto("/api/auth/callback?code=bogus&next=%2F%2Fevil.example");
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/login\?error=linkInvalid$/);
  });
});

test.describe("small screens", () => {
  test.beforeEach(requireSupabase);
  test.use({ viewport: { width: 360, height: 740 } });

  test("auth and dashboard pages never scroll sideways", async ({ page }) => {
    const noOverflow = async () =>
      expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
        .toBeLessThanOrEqual(0);

    for (const path of ["/", "/login", "/sr/signup"]) {
      await page.goto(path);
      await noOverflow();
    }
    const { email, password } = newCredentials();
    await signUp(page, "Mila", email, password);
    for (const path of ["/dashboard", "/sr/dashboard/account"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noOverflow();
    }
    // Icon-only on mobile, but still named for assistive tech.
    await expect(page.getByRole("button", { name: "Odjavi se" })).toBeVisible();
  });
});
