import { handleRate } from "@/lib/widget/handlers";
import { preflightResponse } from "@/lib/widget/cors";
import { widgetRoute } from "@/lib/widget/route";

export const POST = widgetRoute((request, db) => handleRate(request, db));

export function OPTIONS(request: Request) {
  return preflightResponse(request, "POST");
}
