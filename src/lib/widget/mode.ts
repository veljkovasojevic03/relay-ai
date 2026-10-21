import type { Mode } from "./sse";

export type ModeDecision = {
  mode: Mode;
  reason: "live" | "no_api_key" | "daily_cap_reached" | "live_not_included";
};

/**
 * Which engine answers a turn (spec §2, §4.4). Live (Claude) needs an API key and room under
 * the global daily cap of real messages; anything else is Sample.
 *
 * Live mode (spec Phase 10) is deliberately not built: the project must cost nothing to run,
 * and Claude calls are paid. `liveImplemented` is false, so this returns Sample with the
 * honest reason `live_not_included`, even with a key configured: no stub pretends to call
 * Claude. The decision and the key/cap checks stay, so adding an engine later is one switch.
 */
export function selectMode(input: {
  hasApiKey: boolean;
  liveMessagesToday: number;
  dailyCap: number;
  liveImplemented: boolean;
}): ModeDecision {
  if (!input.hasApiKey) return { mode: "sample", reason: "no_api_key" };
  if (input.liveMessagesToday >= input.dailyCap) {
    return { mode: "sample", reason: "daily_cap_reached" };
  }
  if (!input.liveImplemented) return { mode: "sample", reason: "live_not_included" };
  return { mode: "live", reason: "live" };
}

/** False: no Claude engine exists (Phase 10 skipped, see docs/DECISIONS.md). */
export const LIVE_MODE_IMPLEMENTED = false;
