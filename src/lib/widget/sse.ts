/**
 * Server-Sent Events protocol of POST /api/widget/message (spec §7). Same events in Sample
 * and Live mode, always in this order:
 *
 *   meta → delta* → sources? → action_card? → handoff? → done
 *
 * or `error` as the last event when a turn fails midway.
 */

export type Mode = "sample" | "live";
export type Outcome = "answered" | "unknown" | "degraded" | "waiting" | "handoff";

export type WidgetEvent =
  | {
      event: "meta";
      data: {
        /** Only on a conversation's first message. The widget stores it; it is never resent. */
        token?: string;
        /** Realtime channel for "conversation changed" pings; first message only, like the token. */
        channel?: string;
        mode: Mode;
        language: "en" | "sr";
      };
    }
  | { event: "delta"; data: { text: string } }
  | { event: "sources"; data: { faqs: { id: string; question: string }[] } }
  | { event: "action_card"; data: Record<string, unknown> }
  | {
      event: "handoff";
      /** The chat now waits for a person; `message` is the system line to show. */
      data: { reason: string; status: "waiting_human"; message: string; messageId: string | null };
    }
  | {
      event: "done";
      data: {
        outcome: Outcome;
        /** The bot offers a person: it didn't know, or couldn't look the answer up. */
        offerHuman: boolean;
        /** "Did you mean" questions when the bot declined. */
        suggestions: string[];
        remainingMessages: number;
      };
    }
  | { event: "error"; data: { code: string } };

const encoder = new TextEncoder();

/** One SSE frame. JSON on a single `data:` line, so no payload can inject extra fields. */
export function encodeEvent({ event, data }: WidgetEvent): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  // Disables proxy buffering (nginx and friends) so deltas arrive as they are sent.
  "X-Accel-Buffering": "no",
} as const;

/** Streams the events of an async generator as an SSE body. */
export function sseStream(events: AsyncIterable<WidgetEvent>): ReadableStream<Uint8Array> {
  const iterator = events[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(encodeEvent(value));
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

/**
 * Splits an answer into small chunks for `delta` events, a few words each and keeping all
 * whitespace, so joining the chunks gives back the exact text.
 */
export function chunkText(text: string, wordsPerChunk = 3): string[] {
  const tokens = text.match(/\s*\S+/g) ?? [];
  const chunks: string[] = [];
  for (let i = 0; i < tokens.length; i += wordsPerChunk) {
    chunks.push(tokens.slice(i, i + wordsPerChunk).join(""));
  }
  const trailing = /\s+$/.exec(text)?.[0];
  if (trailing && chunks.length) chunks[chunks.length - 1] += trailing;
  return chunks;
}
