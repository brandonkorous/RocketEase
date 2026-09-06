/*
 * Pure rules for the link-in-bio page: limits, the public address, link URLs,
 * and how the brand palette becomes a button colour that stays readable.
 */
import type { ButtonStyle } from "@/db/schema/bio";
import type { Swatch } from "@/lib/brand/types";

/** Limits: 20 links and 160 bio characters are what the network bios themselves allow; the rest are ours. */
export const BIO_LIMITS = { links: 20, title: 80, url: 500, name: 60, bio: 160, slug: 40, posts: 6 } as const;

/** Rolling window for the "last 7 days" count: the last 7 × 24 hours from now. */
export const CLICK_WINDOW_DAYS = 7;

/** 3–40 characters: lowercase letters, digits and inner hyphens. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** Lowercase letters, digits and single hyphens, from any name; "page" when nothing survives. */
export function slugFrom(base: string): string {
  // NFKD splits "é" into "e" + a combining mark; the marks (U+0300–U+036F) are dropped before anything else is replaced.
  const s = base.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, BIO_LIMITS.slug).replace(/-+$/, "");
  return SLUG_RE.test(s) ? s : s.length > 0 && s.length < 3 ? `${s}-page` : "page";
}

/** The base, else base-2, base-3 … — the first address nobody holds. */
export function nextFreeSlug(base: string, taken: (slug: string) => boolean): string {
  const root = slugFrom(base);
  if (!taken(root)) return root;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root.slice(0, BIO_LIMITS.slug - 1 - String(n).length)}-${n}`;
    if (!taken(candidate)) return candidate;
  }
  return `${root.slice(0, 20)}-${Date.now().toString(36)}`;
}

/** A link must be http(s); a bare host gets https://. Anything else (javascript:, data:) is refused. */
export function normalizeUrl(raw: string): { url: string } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { url: "" };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { error: "That is not a web address." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { error: "Links must start with http:// or https://." };
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") return { error: "That is not a web address." };
  if (withScheme.length > BIO_LIMITS.url) return { error: `A link can be ${BIO_LIMITS.url} characters at most.` };
  return { url: parsed.toString() };
}

/** The address as people type it: no scheme, no trailing slash. */
export const displayUrl = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** #rgb or #rrggbb only. */
const isHex = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);

const expand = (hex: string) => (hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex);

/** WCAG relative luminance of a hex colour. */
export function luminance(hex: string): number {
  const h = expand(hex).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The palette's primary swatch, when it is a valid colour. */
export const brandPrimary = (palette: Swatch[]): Swatch | null => palette.find((s) => s.role === "primary" && isHex(s.hex)) ?? null;

/** Button colours: black by rule, or the brand primary with text picked for contrast (dark text once the colour is light). */
export function buttonColors(style: ButtonStyle, palette: Swatch[]): { background: string; text: string } {
  const primary = style === "brand" ? brandPrimary(palette) : null;
  if (!primary) return { background: "#0a0a0a", text: "#ffffff" };
  const bg = expand(primary.hex.toLowerCase());
  return { background: bg, text: luminance(bg) > 0.35 ? "#0a0a0a" : "#ffffff" };
}

/** A link the public page shows: on, and with both a title and an address. */
export const isPublicLink = (l: { enabled: boolean; title: string; url: string }) => l.enabled && l.title.trim().length > 0 && l.url.length > 0;
