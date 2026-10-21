import { connection } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { handleCallback } from "@/lib/n8n/endpoints";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** n8n reports how an escalation or reply email went (signed; spec §8). */
export async function POST(request: Request) {
  await connection();
  const secret = serverEnv().N8N_SHARED_SECRET;
  const db = supabaseAdmin();
  if (!secret || !db) {
    return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  return handleCallback(request, db, secret);
}
