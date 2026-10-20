import { describe, expect, it } from "vitest";

import { chunkText, encodeEvent, sseStream, type WidgetEvent } from "./sse";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("encodeEvent", () => {
  it("writes one event line and one JSON data line", () => {
    const frame = decode(encodeEvent({ event: "delta", data: { text: "Hi\n\nevent: done" } }));
    expect(frame).toBe('event: delta\ndata: {"text":"Hi\\n\\nevent: done"}\n\n');
    // Newlines in content stay escaped inside JSON, so content can't forge a second event.
    expect(frame.split("\n\n")).toHaveLength(2);
  });
});

describe("chunkText", () => {
  it.each([
    "Dostava u Srbiji košta 390 dinara. Za porudžbine preko 5.000 dinara je besplatna.",
    "One.",
    "  leading and trailing  ",
    "Line one\nline two\n\n- a list\n- item",
    "",
  ])("splits %j into chunks that join back exactly", (text) => {
    const chunks = chunkText(text);
    expect(chunks.join("")).toBe(text.trim() === "" ? "" : text);
    for (const chunk of chunks) expect(chunk.trim().split(/\s+/).length).toBeLessThanOrEqual(3);
  });
});

describe("sseStream", () => {
  it("streams events in order and closes", async () => {
    async function* events(): AsyncGenerator<WidgetEvent> {
      yield { event: "meta", data: { mode: "sample", language: "en" } };
      yield { event: "delta", data: { text: "Hi" } };
    }
    const text = await new Response(sseStream(events())).text();
    expect(text).toBe(
      'event: meta\ndata: {"mode":"sample","language":"en"}\n\nevent: delta\ndata: {"text":"Hi"}\n\n',
    );
  });
});
