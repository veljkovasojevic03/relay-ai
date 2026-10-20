import { preflightResponse } from "@/lib/widget/cors";
import { widgetError } from "@/lib/widget/context";
import { defaultMessageDeps, handleMessage } from "@/lib/widget/message";
import { withErrorBoundary } from "@/lib/widget/route";

// Sample answers stream in about a second; this caps a stuck turn well under Vercel Hobby's
// function limit.
export const maxDuration = 30;

export const POST = withErrorBoundary(async (request: Request) => {
  const deps = defaultMessageDeps();
  if (!deps) return widgetError("not_configured", 503);
  return handleMessage(request, deps);
});

export function OPTIONS(request: Request) {
  return preflightResponse(request, "POST");
}
