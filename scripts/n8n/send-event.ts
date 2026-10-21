/**
 * Fires a correctly signed sample event at your n8n workflows (spec §11, Phase 7).
 *
 *   pnpm n8n:send <escalation|reply_email|order_status|create_ticket> [options]
 *
 *   --bad-signature   sign with a wrong secret (must be refused: invalid_signature)
 *   --stale           timestamp 10 minutes old (must be refused: stale_timestamp)
 *   --no-signature    leave out the signature header (must be refused: bad_request)
 *   --nasty           put <script>, & and a newline into visitor text (escaping test)
 *   --test            use n8n's test URL (/webhook-test/...) instead of the production one
 *   --to <email>      owner / visitor email for the mails (default N8N_TEST_EMAIL)
 *   --order <no>      order number for order_status (default KR-10482)
 *   --email <email>   order email for order_status (default marko@example.com)
 *   --base <url>      webhook base (default N8N_WEBHOOK_BASE or http://localhost:5678/webhook)
 *
 * For escalation and reply_email the script also records the event in the app's outbox
 * (when Supabase is configured) and waits for your workflow's callback, so you see whether
 * the callback reached the app and what it reported.
 */

import {
  ACTION_RESULT_SCHEMAS,
  actionResponseSchema,
  WEBHOOK_PATHS,
} from "../../src/lib/n8n/contract";
import { signEvent } from "../../src/lib/n8n/signing";

import {
  adminClient,
  loadEnv,
  parseArgs,
  requireSecret,
  SAMPLE_TYPES,
  sampleEvent,
  sleep,
  type SampleType,
} from "./common";

async function main() {
  loadEnv();
  const { flags, values, positional } = parseArgs(process.argv.slice(2));
  const type = (positional[0] ?? "order_status") as SampleType;
  if (!SAMPLE_TYPES.includes(type)) {
    console.error(`Unknown event "${type}". Use one of: ${SAMPLE_TYPES.join(", ")}`);
    process.exit(2);
  }

  const secret = requireSecret();
  let base = (
    values.base ??
    process.env.N8N_WEBHOOK_BASE ??
    "http://localhost:5678/webhook"
  ).replace(/\/+$/, "");
  if (flags.has("test")) base = base.replace(/\/webhook$/, "/webhook-test");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const to = values.to ?? process.env.N8N_TEST_EMAIL ?? "owner@example.com";

  const event = sampleEvent(type, {
    to,
    appUrl,
    nasty: flags.has("nasty"),
    order: values.order ?? "KR-10482",
    orderEmail: values.email ?? "marko@example.com",
  });
  const sync = event.type.startsWith("action.");
  const expectRejection = flags.has("bad-signature")
    ? "invalid_signature"
    : flags.has("stale")
      ? "stale_timestamp"
      : flags.has("no-signature")
        ? "bad_request"
        : null;

  const timestamp = flags.has("stale") ? Date.now() - 10 * 60 * 1000 : Date.now();
  const signature = signEvent(
    flags.has("bad-signature") ? `${secret}-wrong` : secret,
    timestamp,
    event.eventId,
  );
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Relay-Timestamp": String(timestamp),
    "Idempotency-Key": event.eventId,
  };
  if (!flags.has("no-signature")) headers["X-Relay-Signature"] = signature;

  // Record async events so the app accepts their callback (unknown eventIds get a 404).
  const db = adminClient();
  let outboxId: string | null = null;
  if (!sync && !expectRejection && db) {
    const { data, error } = await db
      .from("n8n_outbox")
      .insert({
        type: event.type,
        payload: { bot: event.bot, owner: event.owner, data: event.data },
        status: "delivered",
        attempts: 1,
        delivered_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error)
      console.warn(
        `! Could not record the event in the outbox (${error.code}); the callback will get 404.`,
      );
    else outboxId = data.id;
  }

  const url = `${base}/${WEBHOOK_PATHS[event.type]}`;
  console.log(`→ POST ${url}`);
  console.log(
    `  type=${event.type} eventId=${event.eventId}${expectRejection ? ` (expecting ${expectRejection})` : ""}`,
  );

  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(sync ? 8_000 : 10_000),
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError" ? "timed out" : "unreachable";
    console.error(
      `✗ n8n ${reason}. Is it running (cd n8n && docker compose up -d) and is the workflow Active?`,
    );
    await cleanup();
    process.exit(1);
  }
  const ms = Math.round(performance.now() - started);
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON: shown as text */
  }
  console.log(`← ${response.status} in ${ms} ms`);
  console.log(`  ${typeof body === "string" ? body.slice(0, 500) : JSON.stringify(body)}`);

  const failures: string[] = [];
  if (response.status === 404) {
    failures.push(
      flags.has("test")
        ? 'n8n has no test listener: open the workflow and click "Listen for test event" first.'
        : "n8n has no production webhook here: is the workflow saved and Active, with this exact path?",
    );
  } else if (expectRejection) {
    if (sync) {
      const ok = (body as { ok?: boolean; error?: string } | null) ?? {};
      if (ok.ok !== false || ok.error !== expectRejection) {
        failures.push(`expected {"ok": false, "error": "${expectRejection}"}`);
      }
      const status = expectRejection === "bad_request" ? 400 : 401;
      if (response.status !== status) failures.push(`expected HTTP ${status}`);
    } else {
      console.log(
        "  (async: n8n answers 200 at once; check its execution: it must stop before sending email)",
      );
    }
  } else if (sync) {
    const schema = actionResponseSchema(
      ACTION_RESULT_SCHEMAS[event.type as keyof typeof ACTION_RESULT_SCHEMAS],
    );
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      failures.push("response doesn't match the contract (docs/N8N_CONTRACT.md §Sync actions)");
    else if (!parsed.data.ok) failures.push(`n8n answered ok: false (${parsed.data.error})`);
    if (!response.ok) failures.push(`expected HTTP 200, got ${response.status}`);
    if (ms > 8_000) failures.push("slower than the app's 8 s limit");
  } else {
    const received = (body as { received?: boolean } | null)?.received === true;
    if (!response.ok || !received) failures.push('expected 200 {"received": true} right away');
    if (ms > 2_000) failures.push(`took ${ms} ms: respond immediately, then send the email`);
  }

  if (!failures.length && outboxId && db) {
    console.log("… waiting up to 30 s for the callback to the app");
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const { data } = await db
        .from("n8n_outbox")
        .select("status, last_error")
        .eq("id", outboxId)
        .single();
      if (data && data.status !== "delivered") {
        console.log(
          `✓ callback received: ${data.status}${data.last_error ? ` (${data.last_error})` : ""}`,
        );
        break;
      }
      if (i === 29)
        failures.push(
          "no callback within 30 s (check the HTTP Request node: URL, signature, body)",
        );
    }
  } else if (!sync && !expectRejection && !db) {
    console.log("  (Supabase not configured here, so the callback can't be checked.)");
  }

  await cleanup();
  if (failures.length) {
    for (const f of failures) console.error(`✗ ${f}`);
    process.exit(1);
  }
  console.log("✓ looks right");

  async function cleanup() {
    if (outboxId && db) await db.from("n8n_outbox").delete().eq("id", outboxId);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
