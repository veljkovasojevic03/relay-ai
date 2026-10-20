import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "@/lib/log";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { widgetError } from "./context";

type Handler = (request: Request) => Promise<Response>;

/** Any unexpected failure becomes a JSON 500 without details (they go to the log). */
export function withErrorBoundary(handler: Handler): Handler {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      log.error("widget.unhandled", {
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.name : "unknown",
      });
      return widgetError("internal", 500);
    }
  };
}

/** A widget route backed by the service-role client; 503 when Supabase isn't configured. */
export function widgetRoute(handler: (request: Request, db: SupabaseClient) => Promise<Response>) {
  return withErrorBoundary(async (request) => {
    const db = supabaseAdmin();
    if (!db) return widgetError("not_configured", 503);
    return handler(request, db);
  });
}
