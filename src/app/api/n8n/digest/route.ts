import { connection } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { handleDigest } from "@/lib/n8n/endpoints";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Weekly digest numbers for n8n (header X-Relay-Secret; spec §7). */
export async function GET(request: Request) {
  await connection();
  const db = supabaseAdmin();
  if (!db) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  return handleDigest(request, db, serverEnv().N8N_SHARED_SECRET);
}
