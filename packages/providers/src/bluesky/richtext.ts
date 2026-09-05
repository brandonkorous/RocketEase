/*
 * Bluesky rich text. Two rules the rest of the stack does not share: the text
 * limit is GRAPHEMES (an emoji is one), and facets address UTF-8 BYTE offsets.
 * Links, mentions and tags found in the text become facets so they render as
 * such; a mention is only a facet once its handle resolves to a DID.
 */
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function graphemes(text: string): number {
  let n = 0;
  for (const _ of segmenter.segment(text)) n++;
  return n;
}

export const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");

export type FacetFeature =
  | { $type: "app.bsky.richtext.facet#link"; uri: string }
  | { $type: "app.bsky.richtext.facet#mention"; did: string }
  | { $type: "app.bsky.richtext.facet#tag"; tag: string };

export type Facet = { index: { byteStart: number; byteEnd: number }; features: FacetFeature[] };

export type Span = { start: number; end: number; kind: "link" | "mention" | "tag"; value: string };

const URL_RE = /https?:\/\/[^\s<>()[\]{}"']+/gu;
const TRAILING = /[.,;:!?'")\]]+$/u;
/** A Bluesky handle is a domain, so a mention always contains a dot. */
const MENTION_RE = /(^|[^\p{L}\p{N}_@])@([\p{L}\p{N}][\p{L}\p{N}.-]*\.[\p{L}]{2,})/gu;
const TAG_RE = /(^|\s)#([\p{L}\p{N}_]+)/gu;

/** UTF-16 spans of everything that becomes a facet, in text order, no overlaps. */
export function spans(text: string): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0].replace(TRAILING, "");
    if (raw.length) out.push({ start: m.index!, end: m.index! + raw.length, kind: "link", value: raw });
  }
  for (const m of text.matchAll(MENTION_RE)) {
    const start = m.index! + m[1].length;
    out.push({ start, end: start + 1 + m[2].length, kind: "mention", value: m[2] });
  }
  for (const m of text.matchAll(TAG_RE)) {
    const start = m.index! + m[1].length;
    out.push({ start, end: start + 1 + m[2].length, kind: "tag", value: m[2] });
  }
  out.sort((a, b) => a.start - b.start);
  return out.filter((s, i) => i === 0 || s.start >= out[i - 1].end);
}

export function byteRange(text: string, start: number, end: number) {
  return { byteStart: utf8Bytes(text.slice(0, start)), byteEnd: utf8Bytes(text.slice(0, end)) };
}

export type ResolveHandle = (handle: string) => Promise<string | null>;

/** Facets for the text; a handle that does not resolve stays plain text rather than pointing nowhere. */
export async function facetsFor(text: string, resolveHandle: ResolveHandle): Promise<Facet[]> {
  const facets: Facet[] = [];
  for (const s of spans(text)) {
    const index = byteRange(text, s.start, s.end);
    if (s.kind === "link") facets.push({ index, features: [{ $type: "app.bsky.richtext.facet#link", uri: s.value }] });
    else if (s.kind === "tag") facets.push({ index, features: [{ $type: "app.bsky.richtext.facet#tag", tag: s.value }] });
    else {
      const did = await resolveHandle(s.value).catch(() => null);
      if (did) facets.push({ index, features: [{ $type: "app.bsky.richtext.facet#mention", did }] });
    }
  }
  return facets;
}
