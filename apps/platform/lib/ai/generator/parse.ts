/*
 * Defensive JSON reading. Models wrap JSON in prose, fence it, or trail a
 * comma — none of that should lose a whole run, and none of it should be
 * papered over by guessing at missing fields.
 */

const FENCE = /```(?:json)?\s*([\s\S]*?)```/i;

/** The first balanced {...} or [...] block in the text, ignoring braces in strings. */
function firstBlock(text: string): string | null {
  const start = text.search(/[[{]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** Trailing commas are the one repair we attempt; anything else is a real failure. */
const dropTrailingCommas = (s: string) => s.replace(/,(\s*[}\]])/g, "$1");

/**
 * Parse a model response as JSON. Returns null rather than throwing — the
 * caller decides whether to retry, and the raw text is never surfaced.
 */
export function parseJson<T = unknown>(raw: string): T | null {
  const fenced = FENCE.exec(raw)?.[1];
  for (const candidate of [fenced, raw, firstBlock(fenced ?? raw)]) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    for (const attempt of [trimmed, dropTrailingCommas(trimmed)]) {
      try {
        return JSON.parse(attempt) as T;
      } catch {
        /* try the next shape */
      }
    }
  }
  return null;
}

/** A JSON array of objects, whatever the model wrapped it in. */
export function parseObjectArray(raw: string, key: string): Record<string, unknown>[] | null {
  const parsed = parseJson<unknown>(raw);
  if (parsed === null) return null;
  const list = Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown>)[key];
  if (!Array.isArray(list)) return null;
  const objects = list.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x));
  return objects.length ? objects : null;
}

/** A trimmed string field, or "" — never `undefined` leaking into copy. */
export function str(o: Record<string, unknown>, key: string, max = 4_000): string {
  const v = o[key];
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** A string list from either an array or a loose "#a #b" string. */
export function strList(o: Record<string, unknown>, key: string, max: number): string[] {
  const v = o[key];
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,]+/) : [];
  return raw
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}
