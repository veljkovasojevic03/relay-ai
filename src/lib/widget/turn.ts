import type { Language } from "@/lib/bots/schema";
import type { SearchResult } from "@/lib/faqs/search";

import { BOT_COPY } from "./copy";
import { SAMPLE_CHUNK_DELAY_MS } from "./limits";
import type { ModeDecision } from "./mode";
import { chunkText, type Outcome, type WidgetEvent } from "./sse";

/**
 * One bot turn after the visitor's message was stored: decide, persist, then stream.
 * The reply is saved BEFORE streaming, so a visitor who closes the tab mid-answer still
 * finds the full reply after a refresh.
 */

export type ReplyRecord = {
  conversationId: string;
  botId: string;
  content: string;
  sourceFaqIds: string[];
  meta: Record<string, string | number | boolean | null>;
  outcome: Exclude<Outcome, "waiting">;
  question: string;
  language: Language;
  firstResponseMs: number;
};

export type TurnDeps = {
  search: (botId: string, text: string, language: Language) => Promise<SearchResult>;
  recordReply: (reply: ReplyRecord) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

export type TurnInput = {
  botId: string;
  conversationId: string;
  text: string;
  language: Language;
  /** Set only when this message started the conversation. */
  token?: string;
  conversationStatus: "bot" | "waiting_human" | "human" | "resolved";
  remainingMessages: number;
  mode: ModeDecision;
  /** When the request arrived (ms), for latency and first-response time. */
  startedAt: number;
};

export async function* runTurn(input: TurnInput, deps: TurnDeps): AsyncGenerator<WidgetEvent> {
  yield {
    event: "meta",
    data: {
      ...(input.token ? { token: input.token } : {}),
      mode: input.mode.mode,
      language: input.language,
    },
  };

  // A person has taken over (Phase 6): the message is stored, the bot stays quiet.
  if (input.conversationStatus !== "bot") {
    yield {
      event: "done",
      data: {
        outcome: "waiting",
        offerHuman: false,
        suggestions: [],
        remainingMessages: input.remainingMessages,
      },
    };
    return;
  }

  let search: SearchResult;
  try {
    search = await deps.search(input.botId, input.text, input.language);
  } catch {
    yield { event: "error", data: { code: "internal" } };
    return;
  }

  const copy = BOT_COPY[input.language];
  let outcome: Exclude<Outcome, "waiting">;
  let reply: string;
  let sources: { id: string; question: string }[] = [];
  let suggestions: string[] = [];
  let similarity: number | null = null;

  if (!search.semantic) {
    // Retrieval itself failed; this is not the bot not knowing, so nothing is logged as such.
    outcome = "degraded";
    reply = copy.degraded;
  } else if (search.decision.kind === "answer") {
    const faq = search.decision.faq;
    outcome = "answered";
    reply = faq.answer;
    sources = [{ id: faq.id, question: faq.question }];
    similarity = faq.similarity;
  } else {
    outcome = "unknown";
    reply = copy.unknown;
    suggestions = search.decision.suggestions.map((m) => m.question);
    similarity = search.matches[0]?.similarity ?? null;
  }

  const latencyMs = Math.max(0, Math.round(deps.now() - input.startedAt));
  try {
    await deps.recordReply({
      conversationId: input.conversationId,
      botId: input.botId,
      content: reply,
      sourceFaqIds: sources.map((s) => s.id),
      meta: {
        mode: input.mode.mode,
        modeReason: input.mode.reason,
        outcome,
        latencyMs,
        similarity: similarity === null ? null : Math.round(similarity * 1000) / 1000,
      },
      outcome,
      question: input.text,
      language: input.language,
      firstResponseMs: latencyMs,
    });
  } catch {
    yield { event: "error", data: { code: "internal" } };
    return;
  }

  const chunks = chunkText(reply);
  for (const [i, text] of chunks.entries()) {
    if (i > 0) await deps.sleep(SAMPLE_CHUNK_DELAY_MS);
    yield { event: "delta", data: { text } };
  }
  if (sources.length) yield { event: "sources", data: { faqs: sources } };
  yield {
    event: "done",
    data: {
      outcome,
      offerHuman: outcome !== "answered",
      suggestions,
      remainingMessages: input.remainingMessages,
    },
  };
}
