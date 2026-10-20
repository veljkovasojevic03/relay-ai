export const LOGO_MAX_BYTES = 200 * 1024;

export type LogoType = {
  ext: "png" | "jpg" | "webp";
  mime: "image/png" | "image/jpeg" | "image/webp";
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((b, i) => bytes[offset + i] === b);

/**
 * Identifies an image by its magic bytes, never by file name or the browser-supplied type.
 * Anything else (SVG, GIF, HTML pretending to be a PNG, …) is rejected.
 */
export function detectLogoType(bytes: Uint8Array): LogoType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ext: "png", mime: "image/png" };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { ext: "jpg", mime: "image/jpeg" };
  // RIFF....WEBP
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

/** Public URL of a stored logo (the bucket is public-read). */
export function logoPublicUrl(supabaseUrl: string, path: string | null): string | null {
  if (!path) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/bot-logos/${encoded}`;
}
