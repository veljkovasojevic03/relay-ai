import "server-only";

import { supabaseAdmin } from "./admin";

export type DbCheck =
  | { status: "ok"; latencyMs: number }
  | { status: "not_configured" }
  | { status: "error"; latencyMs: number };

/** One real round-trip to Postgres (`select now()` via RPC). Doubles as the keep-alive query. */
export async function checkDatabase(): Promise<DbCheck> {
  const db = supabaseAdmin();
  if (!db) return { status: "not_configured" };
  const started = performance.now();
  const { error } = await db.rpc("health_check");
  const latencyMs = Math.round(performance.now() - started);
  return error ? { status: "error", latencyMs } : { status: "ok", latencyMs };
}
