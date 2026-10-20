import type { RateLimitRule } from "@/lib/security/rate-limit";

/** Cost and abuse controls for the public widget API (spec §5.5). */

/** Visitor messages per conversation. */
export const MAX_VISITOR_MESSAGES = 20;
/** Characters per visitor message. */
export const MAX_MESSAGE_CHARS = 500;
/** Request bodies above this are refused before parsing. */
export const MAX_BODY_BYTES = 4096;
/** Pause between streamed chunks of a Sample answer: readable, and well under a second. */
export const SAMPLE_CHUNK_DELAY_MS = 25;

export const WIDGET_RATE_LIMITS = {
  /** Messages per visitor IP and bot. */
  message: { name: "widget:message", limit: 20, windowSeconds: 60 },
  /** New conversations per visitor IP and bot. */
  newConversation: { name: "widget:conversation", limit: 5, windowSeconds: 600 },
  /** Messages per bot per day, across all visitors: caps what one bot can cost. */
  botDaily: { name: "widget:bot-day", limit: 2000, windowSeconds: 86_400 },
  /** Polls per conversation (the widget polls every 5 s). */
  poll: { name: "widget:poll", limit: 30, windowSeconds: 60 },
  /** Config reads per visitor IP. */
  config: { name: "widget:config", limit: 60, windowSeconds: 60 },
  /** Rating / ending a chat, per conversation. */
  feedback: { name: "widget:feedback", limit: 10, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;
