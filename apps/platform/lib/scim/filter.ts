import { ScimError } from "./errors";

/** The slice of RFC 7644 §3.4.2.2 filters real IdPs send for provisioning. */
export type ScimFilterTerm = { attr: string; op: "eq"; value: string | boolean };

const TERM = /^([A-Za-z][A-Za-z0-9_.:$-]*)\s+(eq)\s+(.+)$/i;

/** Same-length copy with quoted regions blanked, so `and` can be found safely. */
function maskQuoted(s: string): string {
  let out = "";
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuote && c === "\\") {
      out += "  ";
      i++;
      continue;
    }
    if (c === '"') {
      inQuote = !inQuote;
      out += '"';
      continue;
    }
    out += inQuote ? " " : c;
  }
  if (inQuote) throw new ScimError(400, "Unterminated string in filter", "invalidFilter");
  return out;
}

function splitOnAnd(filter: string): string[] {
  const mask = maskQuoted(filter);
  if (/[()[\]]/.test(mask)) throw new ScimError(400, "Grouped filters are not supported", "invalidFilter");
  if (/(^|\s)(or|not)(\s|$)/i.test(mask)) throw new ScimError(400, "Only `and` is supported", "invalidFilter");
  const parts: string[] = [];
  let start = 0;
  for (const m of mask.matchAll(/\s+and\s+/gi)) {
    parts.push(filter.slice(start, m.index));
    start = m.index + m[0].length;
  }
  parts.push(filter.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function parseValue(raw: string): string | boolean {
  const v = raw.trim();
  if (/^true$/i.test(v)) return true;
  if (/^false$/i.test(v)) return false;
  if (v.length < 2 || !v.startsWith('"') || !v.endsWith('"')) {
    throw new ScimError(400, `Unsupported filter value ${raw}`, "invalidFilter");
  }
  return v.slice(1, -1).replace(/\\(.)/g, "$1");
}

/**
 * Parses a filter into `eq` terms joined by `and`. Attribute names are
 * lower-cased and any schema URN prefix is dropped, so
 * `urn:…:User:userName eq "a"` and `userName eq "a"` are the same term.
 */
export function parseScimFilter(filter: string | null | undefined): ScimFilterTerm[] {
  if (!filter || !filter.trim()) return [];
  return splitOnAnd(filter).map((part) => {
    const m = TERM.exec(part);
    if (!m) throw new ScimError(400, `Unsupported filter: ${part}`, "invalidFilter");
    const attr = m[1].toLowerCase().split(":").pop() ?? m[1].toLowerCase();
    return { attr, op: "eq" as const, value: parseValue(m[3]) };
  });
}

/** First `eq` value for an attribute, when it is a string. */
export function stringTerm(terms: ScimFilterTerm[], attr: string): string | undefined {
  const t = terms.find((x) => x.attr === attr.toLowerCase());
  return typeof t?.value === "string" ? t.value : undefined;
}

/** First `eq` value for an attribute, when it is a boolean. */
export function boolTerm(terms: ScimFilterTerm[], attr: string): boolean | undefined {
  const t = terms.find((x) => x.attr === attr.toLowerCase());
  return typeof t?.value === "boolean" ? t.value : undefined;
}

/** 1-based paging from `startIndex`/`count` (RFC 7644 §3.4.2.4). */
export function parsePaging(params: URLSearchParams, max: number, fallback: number) {
  const rawStart = Number(params.get("startIndex") ?? 1);
  const rawCount = params.get("count") === null ? fallback : Number(params.get("count"));
  const startIndex = Number.isFinite(rawStart) && rawStart >= 1 ? Math.floor(rawStart) : 1;
  const count = Number.isFinite(rawCount) ? Math.min(Math.max(Math.floor(rawCount), 0), max) : fallback;
  return { startIndex, count, offset: startIndex - 1 };
}
