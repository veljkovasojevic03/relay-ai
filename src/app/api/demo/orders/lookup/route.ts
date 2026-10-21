import { connection } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { handleOrderLookup } from "@/lib/n8n/endpoints";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Demo order lookup for n8n's order_status workflow (header X-Relay-Secret; spec §7). */
async function lookup(request: Request) {
  await connection();
  const db = supabaseAdmin();
  if (!db) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  return handleOrderLookup(request, db, serverEnv().N8N_SHARED_SECRET);
}

export const GET = lookup;
export const POST = lookup;
