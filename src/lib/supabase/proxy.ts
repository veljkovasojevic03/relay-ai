import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import { serverEnv } from "@/lib/env.server";

import type { Database } from "./database.types";

/**
 * Refreshes the owner's session in the proxy and writes any rotated auth cookies onto
 * `response`. Returns whether the request carries a valid, signature-verified session.
 */
export async function refreshSession(
  request: NextRequest,
  response: NextResponse,
): Promise<{ signedIn: boolean }> {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = serverEnv();
  if (!url || !key) return { signedIn: false };

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
        // Responses that set auth cookies must never be cached by a CDN.
        for (const [header, value] of Object.entries(headers)) response.headers.set(header, value);
      },
    },
  });

  // getClaims() verifies the JWT (never trust getSession() on the server).
  const { data, error } = await supabase.auth.getClaims();
  return { signedIn: !error && Boolean(data?.claims?.sub) };
}
