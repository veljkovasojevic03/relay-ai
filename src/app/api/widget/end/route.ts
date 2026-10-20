import { handleEnd } from "@/lib/widget/handlers";
import { preflightResponse } from "@/lib/widget/cors";
import { widgetRoute } from "@/lib/widget/route";

export const POST = widgetRoute((request, db) => handleEnd(request, db));

export function OPTIONS(request: Request) {
  return preflightResponse(request, "POST");
}
