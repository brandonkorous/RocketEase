/*
 * Structured JSON logging. No bodies, tokens, or message content ever go here
 * (NFR-006). Fields: level, msg, time, plus whatever context the caller adds —
 * request/job IDs, org/workspace IDs, provider, durations, error class.
 */
type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === "production" ? "info" : "debug")] ?? 20;

function emit(level: Level, msg: string, fields: Fields, base: Fields) {
  if (LEVELS[level] < threshold) return;
  const rec: Fields = { level, time: new Date().toISOString(), msg, ...base, ...fields };
  if (rec.err instanceof Error) {
    const e = rec.err;
    rec.err = { name: e.name, message: e.message, stack: process.env.NODE_ENV === "production" ? undefined : e.stack };
  }
  const line = JSON.stringify(rec);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(base: Fields = {}) {
  return {
    debug: (msg: string, fields: Fields = {}) => emit("debug", msg, fields, base),
    info: (msg: string, fields: Fields = {}) => emit("info", msg, fields, base),
    warn: (msg: string, fields: Fields = {}) => emit("warn", msg, fields, base),
    error: (msg: string, fields: Fields = {}) => emit("error", msg, fields, base),
    child: (more: Fields) => createLogger({ ...base, ...more }),
  };
}

export const log = createLogger({ app: process.env.MIS_PROCESS ?? "platform" });
export type Logger = ReturnType<typeof createLogger>;
