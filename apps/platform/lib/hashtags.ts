/*
 * Hashtag set logic. Pure and DB-free: the actions load, this decides.
 *
 * The hashtag count mirrors packages/providers/src/validate.ts exactly, so the
 * composer's warning and the publish-time error can never disagree. Networks
 * count hashtags per object, so the same `hashtagsMax` applies to the post text
 * and to the first comment separately.
 */

const HASHTAG = /#[\p{L}\p{N}_]+/gu;

/** How many hashtags a piece of copy contains (same rule the validator uses). */
export function countHashtags(text: string): number {
  return (text.match(HASHTAG) ?? []).length;
}

/** Free text ("#one, two  #three") → ["one", "two", "three"], deduped, order kept. */
export function normalizeTags(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,]+/)) {
    const tag = part.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** Tags as they read in a post. */
export function renderTags(tags: string[]): string {
  return tags.map((t) => `#${t}`).join(" ");
}

/** Append a set to existing copy, skipping tags already present (case-insensitive). */
export function insertTags(current: string, tags: string[]): string {
  const have = new Set((current.match(HASHTAG) ?? []).map((h) => h.slice(1).toLowerCase()));
  const add = tags.filter((t) => !have.has(t.toLowerCase()));
  if (add.length === 0) return current;
  const block = renderTags(add);
  if (!current.trim()) return block;
  return `${current.replace(/\s+$/, "")}${current.endsWith("\n") ? "" : "\n\n"}${block}`;
}

export type HashtagChannel = { id: string; name: string; hashtagsMax: number | null };
export type HashtagLimit = { channelId: string; channelName: string; max: number; count: number; over: number };

/**
 * Which channels the copy would put over their hashtag ceiling. Channels
 * without a published ceiling are not guessed at — they are simply omitted.
 */
export function hashtagLimits(channels: HashtagChannel[], copy: string): HashtagLimit[] {
  const count = countHashtags(copy);
  return channels
    .filter((c) => c.hashtagsMax !== null && count > c.hashtagsMax)
    .map((c) => ({ channelId: c.id, channelName: c.name, max: c.hashtagsMax!, count, over: count - c.hashtagsMax! }));
}

/** One sentence naming the channels a set would push over the limit, or null. */
export function limitWarning(limits: HashtagLimit[]): string | null {
  if (limits.length === 0) return null;
  const worst = limits.reduce((a, b) => (b.over > a.over ? b : a));
  const rest = limits.length - 1;
  const who = rest > 0 ? `${worst.channelName} and ${rest} other channel${rest === 1 ? "" : "s"}` : worst.channelName;
  return `${who} allow${limits.length === 1 ? "s" : ""} at most ${worst.max} hashtags — this would be ${worst.count}.`;
}
