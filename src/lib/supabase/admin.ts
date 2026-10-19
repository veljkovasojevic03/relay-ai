import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env.server";

let client: SupabaseClient | undefined;

/**
 * Service-role client. It bypasses RLS, so every query made with it must be scoped explicitly
 * (spec §5.1). Returns null when Supabase is not configured.
 */
export function supabaseAdmin(): SupabaseClient | null {
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = serverEnv();
  if (!url || !key) return null;
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
