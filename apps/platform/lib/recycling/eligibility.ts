/*
 * Evergreen recycling: which published item a rule should re-post next.
 *
 * Pure and DB-free on purpose — the worker loads candidates, this decides, and
 * every rejection carries the reason a person would give. Nothing here creates
 * or schedules anything.
 */

export type RuleSpec = {
  id: string;
  enabled: boolean;
  everyDays: number;
  maxRepeatsPerItem: number;
  /** Item must carry at least one of these tag ids. Empty = any category. */
  tagIds: string[];
  /** Item must have published to at least one of these channels. Empty = any. */
  channelIds: string[];
  pauseUntil: Date | null;
};

export type Candidate = {
  itemId: string;
  title: string;
  /** When the item last went live. Never null for a real candidate. */
  publishedAt: Date | null;
  tagIds: string[];
  channelIds: string[];
  /** How many copies this rule already made of this item. */
  repeats: number;
  /** When this rule last recycled it (null = never). */
  lastRecycledAt: Date | null;
  /** Assets that can no longer publish: expired rights, failed scan, still processing. */
  blockedAssetReason: string | null;
};

export type Rejection = { itemId: string; reason: string };
export type Selection = { picked: Candidate | null; rejected: Rejection[]; ruleReason: string | null };

const DAY = 86_400_000;
const daysBetween = (a: Date, b: Date) => (a.getTime() - b.getTime()) / DAY;

/** Why this candidate can't be recycled right now, or null. */
function rejectionFor(rule: RuleSpec, c: Candidate, now: Date): string | null {
  if (!c.publishedAt) return "Never published.";
  if (c.repeats >= rule.maxRepeatsPerItem) return `Already recycled ${c.repeats} times (limit ${rule.maxRepeatsPerItem}).`;
  if (rule.tagIds.length && !c.tagIds.some((t) => rule.tagIds.includes(t))) return "Not in this rule's categories.";
  if (rule.channelIds.length && !c.channelIds.some((ch) => rule.channelIds.includes(ch))) return "Never published to this rule's channels.";
  const sinceLive = daysBetween(now, c.publishedAt);
  if (sinceLive < rule.everyDays) return `Published ${Math.floor(sinceLive)} days ago; the rule waits ${rule.everyDays}.`;
  if (c.lastRecycledAt) {
    const sinceRepeat = daysBetween(now, c.lastRecycledAt);
    if (sinceRepeat < rule.everyDays) return `Recycled ${Math.floor(sinceRepeat)} days ago; the rule waits ${rule.everyDays}.`;
  }
  // Rights are checked last so the reason a person sees is the actionable one.
  if (c.blockedAssetReason) return c.blockedAssetReason;
  return null;
}

/** Least-recently-reused first, then oldest published — a backlog cycles evenly. */
function freshest(a: Candidate, b: Candidate) {
  const at = a.lastRecycledAt?.getTime() ?? 0;
  const bt = b.lastRecycledAt?.getTime() ?? 0;
  if (at !== bt) return at - bt;
  return (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0);
}

/** One item per occurrence: the rule re-posts a single piece of content per slot. */
export function selectForOccurrence(rule: RuleSpec, candidates: Candidate[], now: Date): Selection {
  if (!rule.enabled) return { picked: null, rejected: [], ruleReason: "Rule is off." };
  if (rule.pauseUntil && rule.pauseUntil > now) return { picked: null, rejected: [], ruleReason: `Paused until ${rule.pauseUntil.toISOString().slice(0, 10)}.` };
  const rejected: Rejection[] = [];
  const eligible: Candidate[] = [];
  for (const c of candidates) {
    const reason = rejectionFor(rule, c, now);
    if (reason) rejected.push({ itemId: c.itemId, reason });
    else eligible.push(c);
  }
  if (eligible.length === 0) return { picked: null, rejected, ruleReason: "Nothing is due for reuse yet." };
  return { picked: [...eligible].sort(freshest)[0], rejected, ruleReason: null };
}

/** Local slot this rule belongs to on a given day, "YYYY-MM-DDTHH:mm" in the workspace timezone. */
export const occurrenceFor = (localDay: string, atTime: string) => `${localDay}T${atTime}`;

/** Deterministic idempotency key per (rule, item, occurrence). */
export const occurrenceKey = (ruleId: string, itemId: string, occurrence: string) => `${ruleId}:${itemId}:${occurrence}`;
