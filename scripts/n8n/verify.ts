/**
 * Checks the app's callback endpoint against its rejection rules (spec §11, Phase 7).
 *
 *   pnpm n8n:verify [--app http://localhost:3000]
 *
 * Needs the app running (pnpm dev) with the same N8N_SHARED_SECRET. With Supabase
 * configured it also checks the happy path: a valid callback is applied once, and a replay
 * changes nothing.
 */

import { randomUUID } from "node:crypto";

import { signEvent } from "../../src/lib/n8n/signing";

import { adminClient, envValue, loadEnv, parseArgs, requireSecret } from "./common";

async function main() {
  loadEnv();
  const { values } = parseArgs(process.argv.slice(2));
  const secret = requireSecret();
  const app = (values.app ?? envValue("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  const url = `${app}/api/n8n/callback`;

  type Check = { name: string; expect: number; error?: string; result?: string };
  const results: { name: string; ok: boolean; detail: string }[] = [];

  async function call(
    check: Check,
    body: unknown,
    opts: { ts?: number; secret?: string; sign?: string; headers?: boolean } = {},
  ) {
    const ts = opts.ts ?? Date.now();
    const eventId = opts.sign ?? (body as { eventId?: string }).eventId ?? "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.headers !== false) {
      headers["X-Relay-Timestamp"] = String(ts);
      headers["X-Relay-Signature"] = signEvent(opts.secret ?? secret, ts, eventId);
    }
    let status = 0;
    let json: { ok?: boolean; error?: string; result?: string } = {};
    try {
      const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      status = response.status;
      json = (await response.json().catch(() => ({}))) as typeof json;
    } catch {
      console.error(`✗ ${url} is unreachable. Start the app first (pnpm dev).`);
      process.exit(1);
    }
    const ok =
      status === check.expect &&
      (check.error === undefined || json.error === check.error) &&
      (check.result === undefined || json.result === check.result);
    results.push({ name: check.name, ok, detail: `${status} ${JSON.stringify(json)}` });
  }

  const someEvent = randomUUID();
  await call(
    { name: "missing headers → 400 bad_request", expect: 400, error: "bad_request" },
    { eventId: someEvent, status: "sent" },
    { headers: false },
  );
  await call(
    { name: "malformed body → 400 bad_request", expect: 400, error: "bad_request" },
    { eventId: "not-a-uuid", status: "sent" },
  );
  await call(
    { name: "wrong secret → 401 invalid_signature", expect: 401, error: "invalid_signature" },
    { eventId: someEvent, status: "sent" },
    { secret: `${secret}-wrong` },
  );
  await call(
    { name: "timestamp 10 min old → 401 stale_timestamp", expect: 401, error: "stale_timestamp" },
    { eventId: someEvent, status: "sent" },
    { ts: Date.now() - 10 * 60 * 1000 },
  );
  await call(
    {
      name: "body eventId ≠ signed eventId → 401 invalid_signature",
      expect: 401,
      error: "invalid_signature",
    },
    { eventId: someEvent, status: "sent" },
    { sign: randomUUID() },
  );
  await call(
    {
      name: "unknown event (valid signature) → 404 unknown_event",
      expect: 404,
      error: "unknown_event",
    },
    { eventId: someEvent, status: "sent" },
  );

  const db = adminClient();
  if (db) {
    const { data: row, error } = await db
      .from("n8n_outbox")
      .insert({
        type: "escalation",
        payload: { bot: { id: "verify", name: "verify" }, owner: {}, data: {} },
        status: "delivered",
        attempts: 1,
      })
      .select("id, event_id")
      .single();
    if (error || !row) {
      results.push({ name: "record a test event", ok: false, detail: error?.code ?? "no row" });
    } else {
      await call(
        { name: "valid callback → 200 applied", expect: 200, result: "applied" },
        { eventId: row.event_id, status: "sent" },
      );
      await call(
        { name: "same eventId again → 200 replayed (no effect)", expect: 200, result: "replayed" },
        { eventId: row.event_id, status: "failed", error: "replay" },
      );
      const { data: after } = await db
        .from("n8n_outbox")
        .select("status")
        .eq("id", row.id)
        .single();
      results.push({
        name: "outbox row is sent, the replay changed nothing",
        ok: after?.status === "sent",
        detail: `status=${after?.status}`,
      });
      await db.from("n8n_outbox").delete().eq("id", row.id);
    }
  } else {
    console.log("(Supabase not configured: skipping the happy-path checks.)");
  }

  for (const r of results)
    console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : `  got ${r.detail}`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} check(s) failed.` : `\nAll ${results.length} checks passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
