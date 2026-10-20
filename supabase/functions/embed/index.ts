// Edge Function `embed`: text in, 384-dim gte-small vectors out (spec §2, §4.3).
//
// Pure compute: it never reads or writes the database. The Next.js server calls it with the
// project's secret key (`apikey` header), then stores vectors itself, because embedding
// columns are writable by the service role only.
//
// Request:  POST { "input": ["text", ...] }      (1..MAX_BATCH strings)
// Response: 200  { "embeddings": [[...384 numbers], ...] }   same order as input
//           400  { "error": "bad_request", "message": "..." }
//           401  (from withSupabase) when the secret key is missing or wrong

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1";

// About 0.1 s of CPU per text against a ~2 s CPU budget per request (status 546 past it).
const MAX_BATCH = 16;
// gte-small reads at most 512 tokens anyway; the cap bounds work per request.
const MAX_CHARS = 2000;
const DIMENSIONS = 384;

const model = new Supabase.ai.Session("gte-small");

function badRequest(message: string) {
  return Response.json({ error: "bad_request", message }, { status: 400 });
}

function parseInput(body: unknown): string[] | string {
  if (typeof body !== "object" || body === null || !("input" in body)) return "missing input";
  const input = (body as { input: unknown }).input;
  if (!Array.isArray(input) || input.length === 0) return "input must be a non-empty array";
  if (input.length > MAX_BATCH) return `at most ${MAX_BATCH} items per request`;
  const texts: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") return "every item must be a string";
    const text = item.trim();
    if (text.length === 0) return "items must not be empty";
    if (text.length > MAX_CHARS) return `items must be at most ${MAX_CHARS} characters`;
    texts.push(text);
  }
  return texts;
}

export default {
  fetch: withSupabase({ auth: "secret" }, async (req: Request) => {
    if (req.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest("body must be JSON");
    }
    const texts = parseInput(body);
    if (typeof texts === "string") return badRequest(texts);

    const embeddings: number[][] = [];
    // One at a time: the session runs on the function's CPU, and a batch is small.
    for (const text of texts) {
      const vector = (await model.run(text, { mean_pool: true, normalize: true })) as number[];
      if (!Array.isArray(vector) || vector.length !== DIMENSIONS) {
        return Response.json({ error: "model_error" }, { status: 500 });
      }
      embeddings.push(Array.from(vector));
    }

    return Response.json({ embeddings });
  }),
};
