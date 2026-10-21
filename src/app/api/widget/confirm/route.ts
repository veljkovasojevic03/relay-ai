import { handleConfirm } from "@/lib/widget/handlers";
import { preflightResponse } from "@/lib/widget/cors";
import { widgetRoute } from "@/lib/widget/route";

// Real n8n gets 8 s per action; this leaves room for the database around it.
export const maxDuration = 30;

export const POST = widgetRoute((request, db) => handleConfirm(request, db));

export function OPTIONS(request: Request) {
  return preflightResponse(request, "POST");
}
