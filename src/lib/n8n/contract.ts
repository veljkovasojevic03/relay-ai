import { z } from "zod";

/**
 * The app ⇄ n8n contract (spec §8, docs/N8N_CONTRACT.md) as types and validators. Shared by
 * the dispatchers, the callback endpoint and scripts/n8n/send-event.ts.
 */

export const ASYNC_EVENT_TYPES = ["escalation", "reply_email"] as const;
export const ACTION_EVENT_TYPES = ["action.order_status", "action.create_ticket"] as const;

export type AsyncEventType = (typeof ASYNC_EVENT_TYPES)[number];
export type ActionEventType = (typeof ACTION_EVENT_TYPES)[number];
export type EventType = AsyncEventType | ActionEventType;

/** Webhook path per event type, appended to N8N_WEBHOOK_BASE. */
export const WEBHOOK_PATHS: Record<EventType, string> = {
  escalation: "relay-escalation",
  reply_email: "relay-reply-email",
  "action.order_status": "relay-action-order-status",
  "action.create_ticket": "relay-action-create-ticket",
};

/** Sync actions get this long before they count as failed. */
export const ACTION_TIMEOUT_MS = 8_000;
/** Async events only need n8n's immediate `{received: true}`. */
export const DELIVERY_TIMEOUT_MS = 10_000;

export type EnvelopeParts = {
  bot: { id: string; name: string };
  owner: { notificationEmail: string | null; language: "en" | "sr" };
  data: Record<string, unknown>;
};

export type Envelope = {
  eventId: string;
  type: EventType;
  createdAt: string;
} & EnvelopeParts;

export function envelope(
  eventId: string,
  type: EventType,
  createdAt: string,
  parts: EnvelopeParts,
): Envelope {
  // Key order matches the contract document, which makes logs and n8n's UI easier to read.
  return { eventId, type, createdAt, bot: parts.bot, owner: parts.owner, data: parts.data };
}

export const orderStatusResult = z.discriminatedUnion("found", [
  z.object({
    found: z.literal(true),
    status: z.string().min(1).max(40),
    eta: z.string().max(40).nullable().optional(),
    items: z.array(z.string().max(200)).max(50).default([]),
  }),
  z.object({ found: z.literal(false) }),
]);
export type OrderStatusResult = z.output<typeof orderStatusResult>;

export const createTicketResult = z.object({
  ticketRef: z.string().regex(/^[A-Za-z0-9-]{1,40}$/),
});
export type CreateTicketResult = z.output<typeof createTicketResult>;

export const ACTION_ERRORS = [
  "invalid_signature",
  "stale_timestamp",
  "bad_request",
  "upstream_error",
] as const;

/** A sync action's response body: `{ok: true, result}` or `{ok: false, error}`. */
export function actionResponseSchema<T extends z.ZodType>(result: T) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), result }),
    z.object({ ok: z.literal(false), error: z.string().max(100) }),
  ]);
}

export const ACTION_RESULT_SCHEMAS = {
  "action.order_status": orderStatusResult,
  "action.create_ticket": createTicketResult,
} as const;

/** n8n → app callback body for async events. */
export const callbackBody = z.object({
  eventId: z.uuid(),
  status: z.enum(["sent", "failed"]),
  error: z.string().max(500).optional(),
});

/** Order numbers as visitors type them: "kr-10482 " → "KR-10482". */
export function normalizeOrderNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export const ORDER_NUMBER = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

/** A ticket reference like the one n8n generates: `RLY-` + 4 digits. */
export function ticketReference(random: () => number = Math.random): string {
  return `RLY-${String(Math.floor(random() * 10_000)).padStart(4, "0")}`;
}
