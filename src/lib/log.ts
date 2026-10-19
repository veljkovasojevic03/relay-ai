type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, string | number | boolean | null | undefined>;

/**
 * Structured JSON logger. Callers pass ids, counts, and durations — never message content,
 * emails, tokens, or secrets. Fields are flat scalars by design to make leaking objects hard.
 */
function write(level: Level, event: string, fields: Fields = {}) {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Fields) => write("debug", event, fields),
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};
