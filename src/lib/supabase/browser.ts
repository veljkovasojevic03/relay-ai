"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Browser client acting as the signed-in owner (session from the auth cookies), used for
 * Realtime only. URL and key are passed in from the server, so nothing depends on build-time
 * inlining of public env vars.
 */
export function supabaseBrowser(url: string, key: string) {
  client ??= createBrowserClient<Database>(url, key);
  return client;
}
