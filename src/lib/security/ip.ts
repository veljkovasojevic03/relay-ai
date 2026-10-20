import { createHmac } from "node:crypto";

/**
 * Client IP from proxy headers. On Vercel `x-forwarded-for` is set by the platform; its first
 * entry is the client. Returns null when no address is present (e.g. local tests).
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim();
  return ip && ip.length <= 64 ? ip : null;
}

/** Keyed hash so stored rate-limit keys and conversations never contain raw IPs. */
export function hashIp(ip: string, salt: string): string {
  return createHmac("sha256", salt).update(ip).digest("hex");
}
