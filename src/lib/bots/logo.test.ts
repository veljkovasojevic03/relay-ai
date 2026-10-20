import { describe, expect, it } from "vitest";

import { detectLogoType, logoPublicUrl } from "./logo";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe("detectLogoType", () => {
  it("recognizes PNG, JPEG and WebP by signature", () => {
    expect(detectLogoType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toEqual({
      ext: "png",
      mime: "image/png",
    });
    expect(detectLogoType(bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({
      ext: "jpg",
      mime: "image/jpeg",
    });
    expect(detectLogoType(ascii("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toEqual({
      ext: "webp",
      mime: "image/webp",
    });
  });

  it.each([
    ["SVG", ascii('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')],
    ["SVG with XML prolog", ascii('<?xml version="1.0"?><svg/>')],
    ["GIF", ascii("GIF89a")],
    ["HTML", ascii("<!doctype html><script>alert(1)</script>")],
    ["RIFF that is not WebP", ascii("RIFF\u0000\u0000\u0000\u0000WAVEfmt ")],
    ["truncated PNG", bytes(0x89, 0x50, 0x4e)],
    ["empty", bytes()],
  ])("rejects %s", (_name, data) => {
    expect(detectLogoType(data)).toBeNull();
  });
});

describe("logoPublicUrl", () => {
  it("builds the public bucket URL and encodes path segments", () => {
    expect(logoPublicUrl("http://127.0.0.1:54321/", "abc/logo 1.png")).toBe(
      "http://127.0.0.1:54321/storage/v1/object/public/bot-logos/abc/logo%201.png",
    );
    expect(logoPublicUrl("https://x.supabase.co", null)).toBeNull();
  });
});
