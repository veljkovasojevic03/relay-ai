import {
  advanceFlow,
  startFlow,
  type ActionCard,
  type ActionName,
  type ActionParams,
  type FlowState,
  type FlowStep,
} from "@/lib/actions/flow";
import type { Language } from "@/lib/bots/schema";
import type { SearchResult } from "@/lib/faqs/search";

import { BOT_COPY } from "./copy";
import type { HandoffReason, HandoffResult } from "./handoff";
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
  outcome: "answered" | "unknown" | "degraded" | "flow";
  question: string;
  language: Language;
  firstResponseMs: number;
};

export type TurnDeps = {
  search: (botId: string, text: string, language: Language) => Promise<SearchResult>;
  /** Saves the reply; returns the conversation's unknown streak after it. */
  recordReply: (reply: ReplyRecord) => Promise<{ unknownStreak: number }>;
  handoff: (reason: HandoffReason) => Promise<HandoffResult>;
  /** Stores the guided flow's next state (null ends it). */
  saveFlow: (state: FlowState | null) => Promise<void>;
  /** Creates the `pending_confirmation` action run behind a confirmation card. */
  createRun: (action: ActionParams) => Promise<ActionCard>;
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
  channel?: string;
  /** The visitor asked for a person in words ("talk to a human"). */
  wantsHuman: boolean;
  conversationStatus: "bot" | "waiting_human" | "human" | "resolved";
  remainingMessages: number;
  mode: ModeDecision;
  /** A guided action flow in progress: this message answers its question. */
  flow: FlowState | null;
  /** The message asks for an action this bot offers (already filtered). */
  intent: ActionName | null;
  /** When the request arrived (ms), for latency and first-response time. */
  startedAt: number;
};

export async function* runTurn(input: TurnInput, deps: TurnDeps): AsyncGenerator<WidgetEvent> {
  yield {
    event: "meta",
    data: {
      ...(input.token ? { token: input.token } : {}),
      ...(input.channel ? { channel: input.channel } : {}),
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

  if (input.wantsHuman) {
    if (input.flow) await deps.saveFlow(null).catch(() => undefined);
    const handed = await tryHandoff(deps, "requested");
    if (handed) {
      yield handed;
      yield done("handoff", false, [], input.remainingMessages);
      return;
    }
  }

  const step = input.flow
    ? advanceFlow(input.flow, input.text, input.language)
    : input.intent
      ? startFlow(input.intent, input.language)
      : null;
  if (step) {
    yield* flowTurn(input, deps, step);
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
  let outcome: ReplyRecord["outcome"];
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
  let unknownStreak = 0;
  try {
    ({ unknownStreak } = await deps.recordReply({
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
    }));
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

  // Two "I don't know"s in a row: hand the chat to a person (spec §4.4).
  const handed =
    outcome === "unknown" && unknownStreak >= 2 && (await tryHandoff(deps, "unknown_twice"));
  if (handed) yield handed;
  yield done(outcome, !handed && outcome !== "answered", suggestions, input.remainingMessages);
}

function done(
  outcome: Outcome,
  offerHuman: boolean,
  suggestions: string[],
  remainingMessages: number,
  quickReplies: string[] = [],
): WidgetEvent {
  return {
    event: "done",
    data: {
      outcome,
      offerHuman,
      suggestions,
      remainingMessages,
      ...(quickReplies.length ? { quickReplies } : {}),
    },
  };
}

/** One step of a guided action flow: save the state, say the next line, maybe show a card. */
async function* flowTurn(
  input: TurnInput,
  deps: TurnDeps,
  step: FlowStep,
): AsyncGenerator<WidgetEvent> {
  let card: ActionCard | null = null;
  try {
    await deps.saveFlow(step.kind === "ask" ? step.state : null);
    if (step.kind === "confirm") card = await deps.createRun(step);
    const latencyMs = Math.max(0, Math.round(deps.now() - input.startedAt));
    await deps.recordReply({
      conversationId: input.conversationId,
      botId: input.botId,
      content: step.reply,
      sourceFaqIds: [],
      meta: {
        mode: input.mode.mode,
        modeReason: input.mode.reason,
        outcome: "flow",
        latencyMs,
        flow: step.kind === "ask" ? step.state.action : (card?.action ?? null),
      },
      outcome: "flow",
      question: input.text,
      language: input.language,
      firstResponseMs: latencyMs,
    });
  } catch {
    yield { event: "error", data: { code: "internal" } };
    return;
  }

  for (const [i, text] of chunkText(step.reply).entries()) {
    if (i > 0) await deps.sleep(SAMPLE_CHUNK_DELAY_MS);
    yield { event: "delta", data: { text } };
  }
  if (card) yield { event: "action_card", data: card };
  yield done(
    "flow",
    step.kind === "stop" && step.offerHuman,
    [],
    input.remainingMessages,
    step.kind === "ask" ? step.quickReplies : [],
  );
}

/** The `handoff` event, or null when nothing changed (already handed off) or it failed. */
async function tryHandoff(deps: TurnDeps, reason: HandoffReason): Promise<WidgetEvent | null> {
  try {
    const result = await deps.handoff(reason);
    if (result.status !== "handed_off" || !result.message) return null;
    return {
      event: "handoff",
      data: {
        reason,
        status: "waiting_human",
        message: result.message,
        messageId: result.messageId,
      },
    };
  } catch {
    // The visitor can still ask again with the button; the bot keeps offering a person.
    return null;
  }
}
