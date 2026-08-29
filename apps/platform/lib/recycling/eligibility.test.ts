import { describe, expect, it } from "vitest";
import { occurrenceFor, occurrenceKey, selectForOccurrence, type Candidate, type RuleSpec } from "./eligibility";

const NOW = new Date("2026-08-28T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const rule = (over: Partial<RuleSpec> = {}): RuleSpec => ({
  id: "r1", enabled: true, everyDays: 30, maxRepeatsPerItem: 3, tagIds: [], channelIds: [], pauseUntil: null, ...over,
});
const item = (over: Partial<Candidate> = {}): Candidate => ({
  itemId: "i1", title: "Post", publishedAt: daysAgo(60), tagIds: ["evergreen"], channelIds: ["ig"], repeats: 0, lastRecycledAt: null, blockedAssetReason: null, ...over,
});

describe("selectForOccurrence", () => {
  it("picks an eligible item", () => {
    const s = selectForOccurrence(rule(), [item()], NOW);
    expect(s.picked?.itemId).toBe("i1");
    expect(s.ruleReason).toBeNull();
  });

  it("does nothing when the rule is off", () => {
    const s = selectForOccurrence(rule({ enabled: false }), [item()], NOW);
    expect(s.picked).toBeNull();
    expect(s.ruleReason).toBe("Rule is off.");
  });

  it("respects a pause window and resumes after it", () => {
    expect(selectForOccurrence(rule({ pauseUntil: daysAgo(-5) }), [item()], NOW).picked).toBeNull();
    expect(selectForOccurrence(rule({ pauseUntil: daysAgo(5) }), [item()], NOW).picked?.itemId).toBe("i1");
  });

  it("skips an item published more recently than the cadence", () => {
    const s = selectForOccurrence(rule(), [item({ publishedAt: daysAgo(10) })], NOW);
    expect(s.picked).toBeNull();
    expect(s.rejected[0].reason).toMatch(/waits 30/);
  });

  it("skips an item recycled inside the cadence window", () => {
    const s = selectForOccurrence(rule(), [item({ lastRecycledAt: daysAgo(3), repeats: 1 })], NOW);
    expect(s.picked).toBeNull();
    expect(s.rejected[0].reason).toMatch(/Recycled 3 days ago/);
  });

  it("stops at the per-item repeat limit", () => {
    const s = selectForOccurrence(rule({ maxRepeatsPerItem: 2 }), [item({ repeats: 2, lastRecycledAt: daysAgo(90) })], NOW);
    expect(s.rejected[0].reason).toMatch(/limit 2/);
  });

  it("filters by category and by channel", () => {
    expect(selectForOccurrence(rule({ tagIds: ["promo"] }), [item()], NOW).rejected[0].reason).toMatch(/categories/);
    expect(selectForOccurrence(rule({ channelIds: ["li"] }), [item()], NOW).rejected[0].reason).toMatch(/channels/);
    expect(selectForOccurrence(rule({ tagIds: ["evergreen"], channelIds: ["ig"] }), [item()], NOW).picked?.itemId).toBe("i1");
  });

  it("never reuses content whose asset rights have lapsed", () => {
    const s = selectForOccurrence(rule(), [item({ blockedAssetReason: "Usage rights for hero.jpg have expired." })], NOW);
    expect(s.picked).toBeNull();
    expect(s.rejected[0].reason).toMatch(/rights/);
  });

  it("cycles the backlog: least recently reused first, then oldest", () => {
    const s = selectForOccurrence(rule(), [
      item({ itemId: "a", lastRecycledAt: daysAgo(40), publishedAt: daysAgo(200), repeats: 1 }),
      item({ itemId: "b", lastRecycledAt: null, publishedAt: daysAgo(100) }),
      item({ itemId: "c", lastRecycledAt: null, publishedAt: daysAgo(300) }),
    ], NOW);
    expect(s.picked?.itemId).toBe("c");
  });

  it("reports why nothing was due when everything is rejected", () => {
    const s = selectForOccurrence(rule(), [item({ publishedAt: daysAgo(1) })], NOW);
    expect(s.ruleReason).toBe("Nothing is due for reuse yet.");
    expect(s.rejected).toHaveLength(1);
  });
});

describe("idempotency keys", () => {
  it("is stable for the same rule, item and slot", () => {
    const occ = occurrenceFor("2026-08-28", "09:00");
    expect(occ).toBe("2026-08-28T09:00");
    expect(occurrenceKey("r1", "i1", occ)).toBe("r1:i1:2026-08-28T09:00");
    expect(occurrenceKey("r1", "i1", occ)).toBe(occurrenceKey("r1", "i1", occurrenceFor("2026-08-28", "09:00")));
  });
  it("differs across slots and items", () => {
    expect(occurrenceKey("r1", "i1", "2026-08-28T09:00")).not.toBe(occurrenceKey("r1", "i1", "2026-08-29T09:00"));
    expect(occurrenceKey("r1", "i1", "2026-08-28T09:00")).not.toBe(occurrenceKey("r1", "i2", "2026-08-28T09:00"));
  });
});
