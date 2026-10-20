import { handlePoll } from "@/lib/widget/handlers";
import { preflightResponse } from "@/lib/widget/cors";
import { widgetRoute } from "@/lib/widget/route";

export const GET = widgetRoute((request, db) => handlePoll(request, db));

export function OPTIONS(request: Request) {
  return preflightResponse(request, "GET");
}
