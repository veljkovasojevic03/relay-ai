import { z } from "zod";

import type { Language } from "@/lib/bots/schema";
import { normalizeForSearch } from "@/lib/faqs/text";
import { normalizeOrderNumber, ORDER_NUMBER } from "@/lib/n8n/contract";

import { ACTION_COPY } from "./copy";

/**
 * Guided action flows for Sample mode (spec §4.4): a deterministic state machine that asks
 * for each parameter, validates it, and ends in a confirmation card. Pure functions; the
 * state lives in `conversations.action_flow` between messages.
 *
 *   order_status:  orderNumber → email → confirm
 *   create_ticket: subject → description → email (optional) → confirm
 */

export const ACTION_NAMES = ["order_status", "create_ticket"] as const;
export type ActionName = (typeof ACTION_NAMES)[number];

/** Wrong answers in a row before the bot stops asking and offers a person. */
export const MAX_TRIES = 3;

export const flowStateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("order_status"),
    step: z.enum(["orderNumber", "email"]),
    params: z.object({ orderNumber: z.string().optional() }),
    tries: z.number().int().min(0),
  }),
  z.object({
    action: z.literal("create_ticket"),
    step: z.enum(["subject", "description", "email"]),
    params: z.object({ subject: z.string().optional(), description: z.string().optional() }),
    tries: z.number().int().min(0),
  }),
]);
export type FlowState = z.output<typeof flowStateSchema>;

export type OrderStatusParams = { orderNumber: string; email: string };
export type CreateTicketParams = { subject: string; description: string; visitorEmail?: string };
export type ActionParams =
  | { action: "order_status"; params: OrderStatusParams }
  | { action: "create_ticket"; params: CreateTicketParams };

/** The confirmation card the widget shows (SSE `action_card`, and again after a refresh). */
export type ActionCard = {
  actionRunId: string;
  action: ActionName;
  fields: { key: string; value: string }[];
  simulated: boolean;
};

export type FlowStep =
  /** Ask (or ask again) for the next value. */
  | { kind: "ask"; state: FlowState; reply: string; quickReplies: string[] }
  /** All values collected: create the action run and show the confirmation card. */
  | ({ kind: "confirm"; reply: string } & ActionParams)
  /** The visitor cancelled, or gave up after MAX_TRIES wrong answers. */
  | { kind: "stop"; reply: string; offerHuman: boolean };

const email = z.email().max(254);

function ask(state: FlowState, language: Language, retry = false): FlowStep {
  const copy = ACTION_COPY[language];
  const prompts = copy.prompts[state.action] as Record<string, { ask: string; retry: string }>;
  const prompt = prompts[state.step]!;
  const optional = state.action === "create_ticket" && state.step === "email";
  return {
    kind: "ask",
    state,
    reply: retry ? prompt.retry : prompt.ask,
    quickReplies: optional ? [copy.skip, copy.cancel] : [copy.cancel],
  };
}

export function startFlow(action: ActionName, language: Language): FlowStep {
  const state: FlowState =
    action === "order_status"
      ? { action, step: "orderNumber", params: {}, tries: 0 }
      : { action, step: "subject", params: {}, tries: 0 };
  const step = ask(state, language);
  return { ...step, reply: `${ACTION_COPY[language].intro[action]} ${step.reply}` } as FlowStep;
}

// Whole-message matches only: "Stop sending me emails" is a ticket subject, not a cancel.
const CANCEL = /^(cancel|stop|nevermind|never mind|otkazi|odustani|odustajem|prekini)[.!]*$/;
const SKIP = /^(skip|no|no thanks|no email|preskoci|ne|ne hvala|bez emaila|bez mejla)[.!]*$/;

export const isCancel = (text: string) => CANCEL.test(normalizeForSearch(text));
const isSkip = (text: string) => SKIP.test(normalizeForSearch(text));

/** One visitor answer → the next step. */
export function advanceFlow(state: FlowState, text: string, language: Language): FlowStep {
  const copy = ACTION_COPY[language];
  if (isCancel(text)) return { kind: "stop", reply: copy.cancelled, offerHuman: false };

  const value = text.trim();
  const invalid = (): FlowStep => {
    const tries = state.tries + 1;
    if (tries >= MAX_TRIES) return { kind: "stop", reply: copy.gaveUp, offerHuman: true };
    return ask({ ...state, tries }, language, true);
  };

  if (state.action === "order_status") {
    if (state.step === "orderNumber") {
      const orderNumber = normalizeOrderNumber(value);
      if (!ORDER_NUMBER.test(orderNumber)) return invalid();
      return ask({ ...state, step: "email", params: { orderNumber }, tries: 0 }, language);
    }
    const address = email.safeParse(value.toLowerCase());
    if (!address.success || !state.params.orderNumber) return invalid();
    return {
      kind: "confirm",
      reply: copy.confirmPrompt,
      action: "order_status",
      params: { orderNumber: state.params.orderNumber, email: address.data },
    };
  }

  if (state.step === "subject") {
    if (value.length < 3 || value.length > 200) return invalid();
    return ask({ ...state, step: "description", params: { subject: value }, tries: 0 }, language);
  }
  if (state.step === "description") {
    if (value.length < 3) return invalid();
    return ask(
      { ...state, step: "email", params: { ...state.params, description: value }, tries: 0 },
      language,
    );
  }
  const subject = state.params.subject ?? "";
  const description = state.params.description ?? "";
  const address = email.safeParse(value.toLowerCase());
  if (!address.success) {
    if (!isSkip(value)) return invalid();
    return {
      kind: "confirm",
      reply: copy.confirmPrompt,
      action: "create_ticket",
      params: { subject, description },
    };
  }
  return {
    kind: "confirm",
    reply: copy.confirmPrompt,
    action: "create_ticket",
    params: { subject, description, visitorEmail: address.data },
  };
}

/** `m***@example.com`: enough for the owner to recognize, little to leak. */
export function maskEmail(address: string): string {
  const [local = "", domain = ""] = address.split("@");
  return domain ? `${local.slice(0, 1)}***@${domain}` : "***";
}

/** What the confirmation card shows, as label keys the widget translates. */
export function cardFields(input: ActionParams): { key: string; value: string }[] {
  if (input.action === "order_status") {
    return [
      { key: "orderNumber", value: input.params.orderNumber },
      { key: "email", value: input.params.email },
    ];
  }
  return [
    { key: "subject", value: input.params.subject },
    { key: "description", value: input.params.description },
    ...(input.params.visitorEmail ? [{ key: "email", value: input.params.visitorEmail }] : []),
  ];
}
