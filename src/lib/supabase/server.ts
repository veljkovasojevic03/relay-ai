import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

import { serverEnv } from "@/lib/env.server";

import type { Database } from "./database.types";

/**
 * Supabase client acting as the signed-in owner (RLS applies). Create one per request.
 * Returns null when Supabase auth isn't configured.
 */
export async function createSupabaseServerClient() {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = serverEnv();
  if (!url || !key) return null;
  // Session-bound work always runs at request time. Without this, Next's prefetch prerender
  // reaches supabase-js's token-expiry check (Date.now()) and reports an unstable value.
  await connection();
  const store = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes
          // the session on the next request, so this is safe to ignore.
        }
      },
    },
  });
}
