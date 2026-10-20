import { describe, expect, it } from "vitest";

import { LIVE_MODE_IMPLEMENTED, selectMode } from "./mode";

const base = { hasApiKey: true, liveMessagesToday: 0, dailyCap: 200, liveImplemented: true };

describe("selectMode", () => {
  it("is Live only with a key, room under the daily cap, and the engine present", () => {
    expect(selectMode(base)).toEqual({ mode: "live", reason: "live" });
  });

  it("falls back to Sample without a key", () => {
    expect(selectMode({ ...base, hasApiKey: false })).toEqual({
      mode: "sample",
      reason: "no_api_key",
    });
  });

  it("falls back to Sample once the global daily cap is used up", () => {
    expect(selectMode({ ...base, liveMessagesToday: 200 })).toEqual({
      mode: "sample",
      reason: "daily_cap_reached",
    });
  });

  it("says honestly that Live isn't available yet", () => {
    expect(selectMode({ ...base, liveImplemented: false })).toEqual({
      mode: "sample",
      reason: "live_not_available_yet",
    });
  });

  it("ships with Live mode off until Phase 10", () => {
    expect(LIVE_MODE_IMPLEMENTED).toBe(false);
  });
});
