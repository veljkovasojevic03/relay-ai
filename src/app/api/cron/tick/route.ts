import { connection } from "next/server";

import { isAuthorizedBearer } from "@/lib/auth/bearer";
import { serverEnv } from "@/lib/env.server";
import { log } from "@/lib/log";
import { flushOutboxNow } from "@/lib/n8n/flush";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkDatabase } from "@/lib/supabase/health";

const noStore = { "Cache-Control": "no-store" };

/**
 * Called by .github/workflows/cron.yml: the Supabase keep-alive, n8n outbox events that are
 * due (retries with backoff, and anything an after-response flush missed), then
 * `purge_expired_data()`: expired sandboxes, demo/sandbox chats older than 30 days, old
 * rate-limit windows, replay ids and finished outbox rows. Daily caps need no reset: they
 * are rate-limit windows that simply expire.
 */
export async function POST(request: Request) {
  await connection();
  const env = serverEnv();
  if (!env.CRON_SECRET) {
    return Response.json({ error: "not_configured" }, { status: 503, headers: noStore });
  }
  if (!isAuthorizedBearer(request.headers.get("authorization"), env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  }

  const started = performance.now();
  const keepAlive = await checkDatabase();
  const outbox = keepAlive.status === "error" ? null : await flushOutboxNow(25);
  const purged = keepAlive.status === "ok" ? await purgeExpiredData() : null;
  const durationMs = Math.round(performance.now() - started);
  log.info("cron.tick", {
    keepAlive: keepAlive.status,
    outboxClaimed: outbox?.claimed ?? null,
    sandboxesPurged: purged?.sandboxes ?? null,
    conversationsPurged: purged?.conversations ?? null,
    durationMs,
  });

  return Response.json(
    { ok: keepAlive.status !== "error", keepAlive: keepAlive.status, outbox, purged, durationMs },
    { status: keepAlive.status === "error" ? 502 : 200, headers: noStore },
  );
}

type PurgeResult = Record<
  "sandboxes" | "conversations" | "rate_limits" | "seen_event_ids" | "outbox",
  number
>;

async function purgeExpiredData(): Promise<PurgeResult | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const { data, error } = await db.rpc("purge_expired_data");
  if (error) {
    log.error("cron.purge_failed", { code: error.code });
    return null;
  }
  return data as PurgeResult;
}
