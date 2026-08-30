/*
 * Draft naming. Pure string helpers, deliberately free of any db import so they
 * can be tested and reused without a connection.
 */
export const DEFAULT_TITLE = "Untitled post";

/**
 * The composer has no title field, so a draft is named after the first line of
 * its own text. Without this every draft is "Untitled post" and the calendar,
 * approvals queue and template picker are lists of identical rows.
 */
export function deriveTitle(text: string): string {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return DEFAULT_TITLE;
  const clean = line.replace(/\s+/g, " ");
  if (clean.length <= 60) return clean;
  const cut = clean.slice(0, 60);
  const space = cut.lastIndexOf(" ");
  return `${(space > 30 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** True when the stored title is one we generated, so it is safe to keep in sync. */
export const isAutoTitle = (title: string, textItWasDerivedFrom: string) =>
  title === DEFAULT_TITLE || title === deriveTitle(textItWasDerivedFrom);
