import type { Mode } from "./sse";

export type ModeDecision = {
  mode: Mode;
  reason: "live" | "no_api_key" | "daily_cap_reached" | "live_not_available_yet";
};

/**
 * Which engine answers a turn (spec §2, §4.4). Live (Claude) needs an API key and room under
 * the global daily cap of real messages; anything else is Sample.
 *
 * Live mode arrives in Phase 10. Until then `liveImplemented` is false and this returns
 * Sample with the honest reason `live_not_available_yet`, even with a key configured: no
 * stub pretends to call Claude.
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
  if (!input.liveImplemented) return { mode: "sample", reason: "live_not_available_yet" };
  return { mode: "live", reason: "live" };
}

/** Phase 10 flips this when the Claude engine exists. */
export const LIVE_MODE_IMPLEMENTED = false;
