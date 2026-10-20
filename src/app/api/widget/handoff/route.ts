import { handleHandoff } from "@/lib/widget/handlers";
import { preflightResponse } from "@/lib/widget/cors";
import { widgetRoute } from "@/lib/widget/route";

export const POST = widgetRoute((request, db) => handleHandoff(request, db));

export function OPTIONS(request: Request) {
  return preflightResponse(request, "POST");
}
