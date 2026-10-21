import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "@/lib/log";

import { ACTION_NAMES, type ActionName } from "./flow";

/** `order_status` reads the seeded demo orders, so only the demo bot may offer it (§4.7). */
export function actionAllowedFor(action: ActionName, bot: { isDemo: boolean }): boolean {
  return action !== "order_status" || bot.isDemo;
}

/** Actions the owner switched on for this bot, minus any the bot may not offer. */
export async function enabledActions(
  db: SupabaseClient,
  bot: { id: string; isDemo: boolean },
): Promise<ActionName[]> {
  const { data, error } = await db
    .from("bot_actions")
    .select("actions!inner(name)")
    .eq("bot_id", bot.id)
    .eq("enabled", true);
  if (error) {
    // Without the list the bot simply answers from the FAQ; actions are an extra.
    log.error("actions.enabled_failed", { code: error.code });
    return [];
  }
  const names = new Set(
    (data as unknown as { actions: { name: string } | { name: string }[] }[]).flatMap((row) =>
      (Array.isArray(row.actions) ? row.actions : [row.actions]).map((a) => a.name),
    ),
  );
  return ACTION_NAMES.filter((name) => names.has(name) && actionAllowedFor(name, bot));
}
