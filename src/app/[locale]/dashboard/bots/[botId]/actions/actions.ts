"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ACTION_NAMES } from "@/lib/actions/flow";
import { actionAllowedFor } from "@/lib/actions/registry";
import { localeOf, ownerClient } from "@/lib/auth/owner";
import { log } from "@/lib/log";

const toggleSchema = z.object({
  botId: z.uuid(),
  action: z.enum(ACTION_NAMES),
  enabled: z.boolean(),
  locale: z.string().optional(),
});

export type ToggleResult = { ok: true } | { ok: false; error: "notFound" | "demoOnly" | "generic" };

/**
 * Switches one action on or off for a bot (spec §4.7: the UI only toggles the registry).
 * RLS limits it to the owner's bots; `order_status` may only be switched on for the demo bot.
 */
export async function toggleActionAction(input: unknown): Promise<ToggleResult> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic" };
  const { botId, action, enabled } = parsed.data;
  const supabase = await ownerClient(localeOf({ locale: parsed.data.locale ?? "" }));

  const [{ data: bot }, { data: registry }] = await Promise.all([
    supabase.from("bots").select("id, is_demo").eq("id", botId).maybeSingle(),
    supabase.from("actions").select("id").eq("name", action).maybeSingle(),
  ]);
  if (!bot || !registry) return { ok: false, error: "notFound" };
  if (enabled && !actionAllowedFor(action, { isDemo: bot.is_demo === true })) {
    return { ok: false, error: "demoOnly" };
  }

  // Update first; insert the toggle row the first time (owners can't update its keys).
  const updated = await supabase
    .from("bot_actions")
    .update({ enabled })
    .eq("bot_id", botId)
    .eq("action_id", registry.id)
    .select("id");
  let error = updated.error;
  if (!error && !updated.data?.length) {
    ({ error } = await supabase
      .from("bot_actions")
      .insert({ bot_id: botId, action_id: registry.id, enabled }));
  }
  if (error) {
    log.error("actions.toggle_failed", { code: error.code });
    return { ok: false, error: "generic" };
  }
  revalidatePath("/[locale]/dashboard/bots/[botId]/actions", "page");
  return { ok: true };
}
