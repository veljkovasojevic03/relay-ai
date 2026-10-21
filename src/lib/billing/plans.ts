/**
 * What each plan includes (spec §4.9). The database enforces the same numbers
 * (`plan_bot_limit`, `plan_conversation_limit`); a DB test checks they agree.
 */
export const PLANS = {
  free: { bots: 1, conversations: 50 },
  pro: { bots: 3, conversations: 1000 },
} as const;

export type Plan = keyof typeof PLANS;
