import "server-only";

import { cache } from "react";

import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Usage = {
  plan: "free" | "pro";
  /** `YYYY-MM` in UTC, the period `start_conversation` counts in. */
  period: string;
  conversations: number;
  conversationLimit: number;
  bots: number;
  botLimit: number;
};

/** The signed-in owner's usage this month and their plan's limits (`my_usage`, RLS). */
export const getUsage = cache(async (): Promise<Usage> => {
  await requireUser();
  const supabase = (await createSupabaseServerClient())!;
  const { data, error } = await supabase.rpc("my_usage");
  if (error || !data) throw new Error("Could not load usage");
  const usage = data as Usage;
  return { ...usage, plan: usage.plan === "pro" ? "pro" : "free" };
});

/** Share of the monthly conversations used, from 0 to 1. */
export const usageShare = (u: Pick<Usage, "conversations" | "conversationLimit">) =>
  u.conversationLimit > 0 ? Math.min(u.conversations / u.conversationLimit, 1) : 1;

/** First day of the next period, when the counter starts again (UTC). */
export function periodResetsAt(period: string): Date {
  const [year, month] = period.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 1));
}
