import "server-only";

import { parseServerEnv, type ServerEnv } from "./env";

let cached: ServerEnv | undefined;

/** Validated server environment, parsed once per process. */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
