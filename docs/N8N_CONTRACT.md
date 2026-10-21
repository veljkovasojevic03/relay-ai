# n8n integration contract

How the Relay AI app and n8n talk to each other. This file is the English copy of spec §8 in
`RELAY_AI_PROMPT.md` (the source of truth) and must match the workbook
`RELAY_AI_N8N_WORKBOOK.md` §2. If they ever differ, the spec wins and the other two get fixed.

The workflows themselves are built by hand in n8n. This repository never contains workflow
JSON.

## Modes

| `N8N_MODE`  | When                                                             | What happens                                                                                                                                                             |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `simulated` | default; whenever `N8N_WEBHOOK_BASE` is empty (always on Vercel) | Nothing leaves the app. Async events are marked `simulated` ("would have been emailed via n8n"); actions are computed in-process with the same functions n8n would call. |
| `real`      | local development with n8n running                               | The app calls `N8N_WEBHOOK_BASE/<path>` with signed requests. Needs `N8N_WEBHOOK_BASE` and `N8N_SHARED_SECRET`, or the app refuses to boot.                              |

Both modes implement the `N8nDispatcher` interface (`src/lib/n8n/dispatcher.ts`). The
dashboard's **Event log** lists every event either way.

## Signing (both directions)

Every app → n8n request, and every n8n → app callback:

```
POST <url>
Content-Type: application/json
X-Relay-Timestamp: 1760950000000          (ms since epoch)
X-Relay-Signature: <hex>                  (see below)
Idempotency-Key: <eventId>                (app → n8n only)
```

```
signature = hex( HMAC-SHA256( N8N_SHARED_SECRET, "<timestamp>.<eventId>" ) )
```

The receiver checks, in this order:

1. both headers and `eventId` in the body are present, else `bad_request`;
2. `|now − timestamp| ≤ 5 minutes`, else `stale_timestamp`;
3. the signature matches, compared in constant time, else `invalid_signature`.

In n8n, header names arrive in lowercase (`$json.headers['x-relay-signature']`) and the body is
in `$json.body`.

**Deliberate trade-off:** the signature covers the sender and freshness (`timestamp.eventId`),
not the body. Payload integrity relies on TLS. Signing the raw body would need byte-exact
bodies on both sides, which n8n's Webhook node doesn't expose simply. The receiver also rejects
already-seen event ids (callbacks are idempotent).

## Envelope

Same shape for every event:

```json
{
  "eventId": "9b2f6a52-0c1e-4a43-9d1a-5c8f3f7e1a10",
  "type": "escalation",
  "createdAt": "2026-10-20T10:15:00.000Z",
  "bot": { "id": "b1c2…", "name": "Kroj Support" },
  "owner": { "notificationEmail": "you@example.com", "language": "sr" },
  "data": {}
}
```

`type` is one of `escalation`, `reply_email`, `action.order_status`, `action.create_ticket`.

## Webhook paths

Appended to `N8N_WEBHOOK_BASE` (locally `http://localhost:5678/webhook`):

| Path                         | `type`                 | Kind  | n8n answers                                       |
| ---------------------------- | ---------------------- | ----- | ------------------------------------------------- |
| `relay-escalation`           | `escalation`           | async | `200 {"received": true}` at once, then calls back |
| `relay-reply-email`          | `reply_email`          | async | `200 {"received": true}` at once, then calls back |
| `relay-action-order-status`  | `action.order_status`  | sync  | _Respond to Webhook_ with the result              |
| `relay-action-create-ticket` | `action.create_ticket` | sync  | _Respond to Webhook_ with the result              |

## Async events

The app sends them from its outbox after the response to the visitor or owner has gone out.
A delivery that fails (network error, timeout, any non-2xx) is retried after 1 min, 5 min,
30 min, 2 h and 6 h, then marked `failed`. The hourly cron tick picks up anything due.

Outbox statuses: `pending` → `delivered` (n8n answered 200) → `sent` / `failed` (callback).
`pending` → `failed` when retries run out; `pending` → `simulated` without n8n.

### `escalation`: email the owner that a chat needs a person

```json
{
  "conversationId": "c0a8…",
  "reason": "unknown_twice",
  "visitorEmail": "kupac@example.com",
  "lastMessages": [
    { "role": "visitor", "text": "Da li imate patike broj 52?" },
    { "role": "bot", "text": "Nisam siguran za to i ne bih da nagađam. …" }
  ],
  "inboxUrl": "http://localhost:3000/sr/dashboard/inbox/c0a8…"
}
```

- `reason`: `unknown_twice` (two "I don't know" in a row), `requested` (the visitor asked for a
  person), `action_failed` (the visitor asked for a person right after an action failed).
- `visitorEmail` is present only if the visitor left one.
- `lastMessages`: at most 6, oldest first, each `{role, text}` with `text` ≤ 500 characters.
  `role` is `visitor`, `bot`, `human` or `system`.
- `inboxUrl` opens the chat in the owner's dashboard language.

### `reply_email`: email the visitor the owner's reply

Sent when the owner replies and the visitor left an email and has been away more than 3 minutes.

```json
{
  "conversationId": "c0a8…",
  "visitorEmail": "kupac@example.com",
  "replyText": "Broj 52 trenutno nemamo, ali stiže u ponedeljak.",
  "shopName": "Kroj — moda i obuća",
  "language": "sr"
}
```

The email contains the reply text and the shop name only: no tokens, no links into the chat.

### Callback (n8n → app)

```
POST http://host.docker.internal:3000/api/n8n/callback
X-Relay-Timestamp, X-Relay-Signature   (same algorithm; n8n computes it)
Content-Type: application/json

{ "eventId": "<the event's eventId>", "status": "sent" | "failed", "error": "optional, ≤ 500 chars" }
```

| App answers                                                            | When                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------- |
| `200 {"ok": true, "result": "applied"}`                                | first callback for this event; the outbox row is updated |
| `200 {"ok": true, "result": "replayed"}`                               | this eventId was already reported; nothing changes       |
| `400 {"ok": false, "error": "bad_request"}`                            | headers or body missing or malformed                     |
| `401 {"ok": false, "error": "stale_timestamp" \| "invalid_signature"}` | signature checks failed                                  |
| `404 {"ok": false, "error": "unknown_event"}`                          | no such async event (or it was simulated)                |

## Sync actions

The app waits **8 seconds** at most. Anything that isn't `{ "ok": true, … }` with the expected
`result` (an error, a timeout, a malformed body, a non-2xx status) fails the action run: the
visitor gets a friendly message and is offered a person, and the error is visible in the
bot's Actions tab and the Event log.

Actions run only after the visitor confirms a card in the chat.

### `action.order_status`

```json
{ "actionRunId": "r1…", "params": { "orderNumber": "KR-10482", "email": "marko@example.com" } }
```

n8n verifies the signature, calls the app's lookup endpoint (below) and returns its result:

```json
{ "ok": true, "result": { "found": true, "status": "shipped", "eta": "2026-10-24", "items": ["Patike Trk"] } }
{ "ok": true, "result": { "found": false } }
```

`found: false` is the answer for both "no such order" and "email doesn't match", on purpose:
the endpoint must not reveal which order numbers exist. `status` is one of `processing`,
`shipped`, `delivered`, `cancelled`; `eta` is `YYYY-MM-DD` or `null`.

### `action.create_ticket`

```json
{
  "actionRunId": "r2…",
  "conversationId": "c0a8…",
  "params": {
    "subject": "Pogrešna veličina",
    "description": "Stigao je broj 41 umesto 42.",
    "visitorEmail": "marko@example.com"
  }
}
```

`visitorEmail` is optional. n8n verifies, generates a reference (`RLY-` + 4 digits), emails the
owner, and returns:

```json
{ "ok": true, "result": { "ticketRef": "RLY-0042" } }
```

The app stores the ticket with this reference (`tickets.reference`, unique).

### Errors

```json
{ "ok": false, "error": "invalid_signature" }
```

| `error`             | HTTP                                       |
| ------------------- | ------------------------------------------ |
| `invalid_signature` | 401                                        |
| `stale_timestamp`   | 401                                        |
| `bad_request`       | 400                                        |
| `upstream_error`    | 502 (the app's lookup failed or timed out) |

## Endpoints n8n calls (pull)

Header `X-Relay-Secret: <N8N_SHARED_SECRET>` (no signature). From inside Docker the app is at
`http://host.docker.internal:3000`.

- `POST /api/demo/orders/lookup` with `{ "orderNumber": "KR-10482", "email": "marko@example.com" }`
  (or `GET` with the same query parameters) → `{ "found": true, "status", "eta", "items" }` or
  `{ "found": false }`. 401 without the right secret, 400 for a malformed body.
- `GET /api/n8n/digest?period=7d` (1–31 days) →

  ```json
  {
    "ok": true,
    "period": { "days": 7, "from": "…", "to": "…" },
    "owners": [
      {
        "notificationEmail": "you@example.com",
        "language": "sr",
        "displayName": "Veljko",
        "conversations": 42,
        "resolvedByBot": 35,
        "handedOff": 7,
        "avgFirstResponseMs": 840,
        "thumbsUpShare": 0.86,
        "topUnknownQuestions": [{ "question": "Da li imate patike broj 52?", "count": 3 }]
      }
    ]
  }
  ```

  Only owners who turned on the weekly digest are listed. `owners` may be empty;
  `avgFirstResponseMs` and `thumbsUpShare` are `null` without data.

## Payload hygiene

- Everything user-provided is plain text in the JSON: control characters stripped, lengths
  capped. **HTML escaping is the email template's job**: escape `& < > " '` before putting any
  of it into an email, and strip newlines from subjects.
- Payloads never contain tokens, Realtime channel names or service keys.
- The app logs event types, ids and outcomes, never payloads. Stored action events keep only a
  masked email (`m***@example.com`).

## Testing

```bash
pnpm n8n:send order_status                  # signed sample event, checks the answer
pnpm n8n:send order_status --bad-signature  # must be refused: invalid_signature
pnpm n8n:send order_status --stale          # must be refused: stale_timestamp
pnpm n8n:send escalation --nasty            # HTML and newlines in visitor text
pnpm n8n:verify                             # the app's callback rejection rules
```

See `n8n/README.md` for setup, and the workbook for the lessons.
