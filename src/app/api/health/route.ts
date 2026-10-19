import { connection } from "next/server";

import { hasLiveLlm, hasStripe } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { log } from "@/lib/log";
import { checkDatabase } from "@/lib/supabase/health";

// 200 when healthy or when the database simply isn't configured yet (local dev, CI);
// 503 only when a configured database fails the round-trip.
export async function GET() {
  await connection();
  const env = serverEnv();
  const db = await checkDatabase();
  if (db.status === "error") log.error("health.db_failed", { latencyMs: db.latencyMs });

  const status = db.status === "ok" ? "ok" : db.status === "not_configured" ? "degraded" : "error";
  return Response.json(
    {
      status,
      checks: {
        db,
        llm: hasLiveLlm(env) ? "live" : "sample",
        n8n: env.N8N_MODE,
        stripe: hasStripe(env) ? "test_mode" : "not_configured",
      },
    },
    { status: db.status === "error" ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
