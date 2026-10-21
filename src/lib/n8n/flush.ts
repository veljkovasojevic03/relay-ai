import "server-only";

import { after } from "next/server";

import { log } from "@/lib/log";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { n8nDispatcher } from "./dispatcher";
import { flushOutbox } from "./outbox";

/** Sends due outbox events now. The cron tick catches anything this misses. */
export async function flushOutboxNow(limit = 10) {
  const db = supabaseAdmin();
  if (!db) return null;
  try {
    return await flushOutbox(db, n8nDispatcher(db), limit);
  } catch (error) {
    log.error("outbox.flush_failed", { error: error instanceof Error ? error.name : "unknown" });
    return null;
  }
}

/**
 * Delivers freshly enqueued events after the response has been sent, so the visitor or
 * owner never waits for n8n. Only callable during a request (route handler, server action).
 */
export function flushOutboxAfterResponse() {
  after(() => flushOutboxNow().then(() => undefined));
}
