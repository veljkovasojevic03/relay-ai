import { connection } from "next/server";

import { hasLiveLlm, hasN8n, hasStripe, hasSupabase } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

// Reports which integrations are configured. The real database round-trip is added together
// with the Supabase client; until then `db` is honestly reported as "not_configured".
export async function GET() {
  await connection();
  const env = serverEnv();
  return Response.json(
    {
      status: "ok",
      checks: {
        db: hasSupabase(env) ? "configured" : "not_configured",
        llm: hasLiveLlm(env) ? "live" : "sample",
        n8n: hasN8n(env) ? "configured" : "simulated",
        stripe: hasStripe(env) ? "test_mode" : "not_configured",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
