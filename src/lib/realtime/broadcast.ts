import "server-only";

import { serverEnv } from "@/lib/env.server";
import { log } from "@/lib/log";

/**
 * Tells an open widget that its conversation changed (spec §4.6, §7). The ping carries no
 * content: the widget answers it by calling the token-protected poll endpoint. Knowing a
 * channel name therefore reveals nothing, and a forged ping can't inject a message.
 *
 * Uses Supabase's Realtime broadcast REST endpoint with the secret key. Best effort: when it
 * fails, the widget's 5-second polling still delivers the reply.
 */
export async function pingConversation(
  channel: string,
  kind: "message" | "status",
): Promise<boolean> {
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = serverEnv();
  if (!url || !key) return false;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ topic: channel, event: "update", payload: { kind }, private: false }],
      }),
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!response.ok) {
      log.warn("realtime.broadcast_failed", { status: response.status });
      return false;
    }
    return true;
  } catch {
    log.warn("realtime.broadcast_failed", { status: 0 });
    return false;
  }
}
