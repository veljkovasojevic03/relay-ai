import { connection } from "next/server";

import { isAuthorizedBearer } from "@/lib/auth/bearer";
import { serverEnv } from "@/lib/env.server";
import { log } from "@/lib/log";
import { checkDatabase } from "@/lib/supabase/health";

const noStore = { "Cache-Control": "no-store" };

/**
 * Called by .github/workflows/cron.yml. For now it only runs the Supabase keep-alive; outbox
 * retries, counter resets and purging are added by the phases that introduce them.
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
  const durationMs = Math.round(performance.now() - started);
  log.info("cron.tick", { keepAlive: keepAlive.status, durationMs });

  return Response.json(
    { ok: keepAlive.status !== "error", keepAlive: keepAlive.status, durationMs },
    { status: keepAlive.status === "error" ? 502 : 200, headers: noStore },
  );
}
