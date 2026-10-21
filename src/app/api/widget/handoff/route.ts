import { flushOutboxAfterResponse } from "@/lib/n8n/flush";
import { handleHandoff } from "@/lib/widget/handlers";
import { preflightResponse } from "@/lib/widget/cors";
import { widgetRoute } from "@/lib/widget/route";

// The owner's escalation email goes out after the response, so the visitor never waits.
export const POST = widgetRoute((request, db) =>
  handleHandoff(request, db, flushOutboxAfterResponse),
);

export function OPTIONS(request: Request) {
  return preflightResponse(request, "POST");
}
