import "server-only";

import { serverEnv } from "@/lib/env.server";

/** Public Supabase URL and browser-safe key for the inbox's Realtime subscription. */
export function realtimeProps(): { url: string; key: string } | null {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = serverEnv();
  return url && key ? { url, key } : null;
}
