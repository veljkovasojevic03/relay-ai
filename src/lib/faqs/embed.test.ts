import { afterEach, describe, expect, it, vi } from "vitest";

import { EMBED_BATCH_SIZE, EmbedError, embedTexts, toPgVector } from "./embed";

const config = { supabaseUrl: "https://example.supabase.co/", secretKey: "sb_secret_test" };
const vector = (seed: number) => Array.from({ length: 384 }, (_, i) => (i === seed ? 1 : 0));

type Call = { url: string; init: RequestInit; input: string[] };

/** A fake embed function: answers each request with `respond(input)`. */
function fakeEmbed(respond: (input: string[]) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const input = (JSON.parse(String(init.body)) as { input: string[] }).input;
      calls.push({ url, init, input });
      return respond(input);
    }),
  );
  return calls;
}

const ok = (input: string[]) =>
  Response.json({ embeddings: input.map((text) => vector(text.length % 384)) });

afterEach(() => vi.unstubAllGlobals());

describe("embedTexts", () => {
  it("posts batches to the function with the secret key and keeps order", async () => {
    const calls = fakeEmbed(ok);
    const texts = Array.from({ length: EMBED_BATCH_SIZE + 3 }, (_, i) => "x".repeat(i + 1));
    const vectors = await embedTexts(texts, config);

    expect(calls.map((c) => c.input.length)).toEqual([EMBED_BATCH_SIZE, 3]);
    expect(calls[0]!.url).toBe("https://example.supabase.co/functions/v1/embed");
    expect(new Headers(calls[0]!.init.headers).get("apikey")).toBe("sb_secret_test");
    expect(vectors).toHaveLength(texts.length);
    expect(vectors[4]!.indexOf(1)).toBe(5);
  });

  it("splits a batch that hits the runtime's CPU limit (546)", async () => {
    const calls = fakeEmbed((input) =>
      input.length > 2 ? new Response("limit", { status: 546 }) : ok(input),
    );
    const vectors = await embedTexts(["a", "bb", "ccc", "dddd", "eeeee"], config);
    expect(vectors.map((v) => v.indexOf(1))).toEqual([1, 2, 3, 4, 5]);
    expect(calls.filter((c) => c.input.length <= 2).length).toBeGreaterThanOrEqual(3);
  });

  it.each([
    [401, "unauthorized"],
    [400, "bad_request"],
    [503, "unavailable"],
    [546, "unavailable"],
  ] as const)("maps HTTP %i to %s", async (status, reason) => {
    fakeEmbed(() => new Response("{}", { status }));
    await expect(embedTexts(["one"], config)).rejects.toMatchObject({ reason });
  });

  it("rejects malformed responses instead of storing junk vectors", async () => {
    fakeEmbed(() => Response.json({ embeddings: [[1, 2, 3]] }));
    await expect(embedTexts(["one"], config)).rejects.toBeInstanceOf(EmbedError);

    fakeEmbed(() => Response.json({ embeddings: [] }));
    await expect(embedTexts(["one"], config)).rejects.toMatchObject({ reason: "bad_response" });
  });

  it("reports network failures as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(embedTexts(["one"], config)).rejects.toMatchObject({ reason: "unavailable" });
  });
});

describe("toPgVector", () => {
  it("formats pgvector's text input", () => {
    expect(toPgVector([0.5, -1, 0])).toBe("[0.5,-1,0]");
  });
});
