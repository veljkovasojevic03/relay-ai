/**
 * Client for the `embed` Edge Function (supabase/functions/embed). Pure fetch, no
 * server-only import, so the eval script can use it too. Callers pass the project's secret
 * key; never call this from the browser.
 */

export const EMBEDDING_DIMENSIONS = 384;
/**
 * Texts per request; must not exceed MAX_BATCH in the Edge Function. gte-small costs about
 * 0.1 s of CPU per text, and a request gets about 2 s of CPU before the runtime stops it.
 */
export const EMBED_BATCH_SIZE = 8;
/** Edge runtime status when a request hits its CPU or memory limit. */
const WORKER_LIMIT = 546;

export type EmbedConfig = { supabaseUrl: string; secretKey: string; timeoutMs?: number };

export class EmbedError extends Error {
  constructor(
    readonly reason: "unavailable" | "unauthorized" | "bad_request" | "bad_response" | "timeout",
    readonly status?: number,
  ) {
    super(`embed failed: ${reason}${status ? ` (${status})` : ""}`);
    this.name = "EmbedError";
  }
}

function isVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === EMBEDDING_DIMENSIONS &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

async function embedBatch(texts: string[], config: EmbedConfig): Promise<number[][]> {
  let response: Response;
  try {
    response = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/functions/v1/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.secretKey },
      body: JSON.stringify({ input: texts }),
      signal: AbortSignal.timeout(config.timeoutMs ?? 20_000),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new EmbedError(timedOut ? "timeout" : "unavailable");
  }

  if (response.status === 401 || response.status === 403) {
    throw new EmbedError("unauthorized", response.status);
  }
  if (response.status === 400) throw new EmbedError("bad_request", 400);
  if (response.status === WORKER_LIMIT && texts.length > 1) {
    // Too much work for one request (long texts, a slow instance): split and retry.
    const half = Math.ceil(texts.length / 2);
    return [
      ...(await embedBatch(texts.slice(0, half), config)),
      ...(await embedBatch(texts.slice(half), config)),
    ];
  }
  if (!response.ok) throw new EmbedError("unavailable", response.status);

  const body: unknown = await response.json().catch(() => null);
  const embeddings = (body as { embeddings?: unknown } | null)?.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
    throw new EmbedError("bad_response", response.status);
  }
  if (!embeddings.every(isVector)) throw new EmbedError("bad_response", response.status);
  return embeddings;
}

/** Embeds any number of texts, in order, batching to the function's limit. */
export async function embedTexts(texts: string[], config: EmbedConfig): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    out.push(...(await embedBatch(texts.slice(i, i + EMBED_BATCH_SIZE), config)));
  }
  return out;
}

/** pgvector's text input format. */
export const toPgVector = (vector: number[]) => `[${vector.join(",")}]`;
