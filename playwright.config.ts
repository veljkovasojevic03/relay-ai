import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const HOST_PORT = PORT + 1;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Saving an FAQ waits for the embed function; without it (CI) the stack's gateway takes
  // about 5 s to give up, so 5 s assertions would race it.
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    // Runs against a production build so e2e matches what Vercel serves.
    {
      command: `pnpm start --port ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      // Auth emails and OAuth redirects must point back at this server, not the dev port.
      env: { NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}` },
    },
    // A third-party page on another origin that embeds the widget (e2e/widget.spec.ts).
    {
      command: "node e2e/support/host-server.mjs",
      url: `http://localhost:${HOST_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
      env: { HOST_PORT: String(HOST_PORT) },
    },
  ],
});
