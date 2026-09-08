/** Words or "quoted phrases", one per comma or line; quotes are kept so a phrase searches as one. */
export const MAX_TERMS = 10;
export const MAX_TERM_LENGTH = 80;

export function parseTerms(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[\n,]+/)) {
    const t = part.trim().slice(0, MAX_TERM_LENGTH);
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, MAX_TERMS);
}
