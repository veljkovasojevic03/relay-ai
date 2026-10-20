import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Integration tests against the LOCAL Supabase stack (pnpm db:start). Files run one at a
// time because they share one database; tests inside a file isolate themselves with fresh
// users and bots.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // Route handlers and server libraries are tested directly against the local stack.
    alias: {
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["tests/db/global-setup.ts"],
    setupFiles: ["tests/db/setup-env.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
