import { describe, expect, it } from "vitest";
import type { ChannelFacts, PostFact, WorkspaceFacts } from "../types";
import { computeSlots } from "../slots";
import { audienceGrowthRule, cadenceGapRule, decliningTrendRule, formatPerformanceRule, inboxResponseLoadRule, reuseCandidateRule } from "./index";

const TO = "2026-08-27";
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function post(day: string, over: Partial<PostFact> = {}): PostFact {
  return { itemId: `i-${day}-${over.format ?? "image"}-${over.reach ?? 100}`, title: "Post", remoteId: `r-${day}`, channelId: "ch1", publishedAt: new Date(`${day}T09:00:00Z`), day, weekday: 2, hour: 9, format: "image", reach: 100, engagement: 5, clicks: 1, ...over };
}

function channel(over: Partial<ChannelFacts> = {}): ChannelFacts {
  return { channelId: "ch1", name: "Demo page", network: "mock", posts: [], reachByDay: [], engagementByDay: [], followerGainByDay: [], ...over };
}

function facts(over: Partial<WorkspaceFacts> = {}): WorkspaceFacts {
  return {
    workspaceId: "ws1", organizationId: "org1", timezone: "UTC",
    period: { from: shift(TO, -89), to: TO }, today: shift(TO, 1),
    channels: [channel()],
    inbox: { open: 0, unanswered: 0, overdue: 0, medianFirstResponseMinutes: null, targetMinutes: 60, answeredSample: 0 },
    ...over,
  };
}

const days = (n: number, value: number, endsAt = TO) => Array.from({ length: n }, (_, i) => ({ day: shift(endsAt, -(n - 1 - i)), value }));

describe("cadenceGapRule", () => {
  const weekly = Array.from({ length: 12 }, (_, i) => post(shift(TO, -84 + i * 7)));

  it("says nothing below the minimum sample", () => {
    expect(cadenceGapRule(facts({ channels: [channel({ posts: weekly.slice(0, 4) })] }))).toHaveLength(0);
  });

  it("says nothing while the channel is on its usual rhythm", () => {
    const onTime = [...weekly, post(shift(TO, -1))];
    expect(cadenceGapRule(facts({ channels: [channel({ posts: onTime })] }))).toHaveLength(0);
  });

  it("flags a gap past twice the channel's own median, with its evidence", () => {
    const stalled = Array.from({ length: 10 }, (_, i) => post(shift(TO, -80 + i * 7)));
    const [rec] = cadenceGapRule(facts({ channels: [channel({ posts: stalled })] }));
    expect(rec.kind).toBe("cadence_gap");
    expect(rec.channelId).toBe("ch1");
    expect(rec.evidence.metrics.find((m) => m.label === "Median gap between posts")?.value).toBe(7);
    expect(rec.evidence.samples[0].n).toBe(10);
    expect(rec.evidence.definitionsVersion).toMatch(/^\d{4}\.\d{2}/);
  });
});

describe("formatPerformanceRule", () => {
  const mixed = [
    ...Array.from({ length: 5 }, (_, i) => post(shift(TO, -60 + i), { format: "video", engagement: 20 })),
    ...Array.from({ length: 5 }, (_, i) => post(shift(TO, -40 + i), { format: "image", engagement: 5 })),
  ];

  it("names the format that beats the channel median", () => {
    const [rec] = formatPerformanceRule(facts({ channels: [channel({ posts: mixed })] }));
    expect(rec.title).toContain("video");
    expect(rec.evidence.metrics[0].value).toBeCloseTo(0.2, 5);
    expect(rec.evidence.metrics[1].value).toBeCloseTo(0.125, 5);
  });

  it("needs at least two scored formats", () => {
    const oneFormat = Array.from({ length: 10 }, (_, i) => post(shift(TO, -40 + i), { format: "video", engagement: 20 }));
    expect(formatPerformanceRule(facts({ channels: [channel({ posts: oneFormat })] }))).toHaveLength(0);
  });

  it("ignores posts with no reach rather than dividing by zero", () => {
    const zeroReach = mixed.map((p) => ({ ...p, reach: 0 }));
    expect(formatPerformanceRule(facts({ channels: [channel({ posts: zeroReach })] }))).toHaveLength(0);
  });
});

describe("reuseCandidateRule", () => {
  const base = Array.from({ length: 10 }, (_, i) => post(shift(TO, -70 + i)));

  it("only suggests winners older than 30 days", () => {
    const recent = [...base, post(shift(TO, -5), { engagement: 40 })];
    expect(reuseCandidateRule(facts({ channels: [channel({ posts: recent })] }))).toHaveLength(0);
  });

  it("suggests an old post that clearly beat the channel median", () => {
    const winner = post(shift(TO, -60), { engagement: 40, itemId: "winner" });
    const [rec] = reuseCandidateRule(facts({ channels: [channel({ posts: [...base, winner] })] }));
    expect(rec.contentItemId).toBe("winner");
    expect(rec.action?.segment).toBe("posts/winner");
    expect(rec.evidence.metrics.find((m) => m.label === "Reach")?.value).toBe(100);
  });
});

describe("decliningTrendRule", () => {
  it("needs 7 days of facts in both windows", () => {
    const thin = channel({ reachByDay: days(5, 100) });
    expect(decliningTrendRule(facts({ channels: [thin] }))).toHaveLength(0);
  });

  it("reports a real drop with both window totals", () => {
    const c = channel({ reachByDay: [...days(14, 200, shift(TO, -14)), ...days(14, 100)] });
    const [rec] = decliningTrendRule(facts({ channels: [c] }));
    expect(rec.kind).toBe("declining_trend");
    expect(rec.evidence.metrics[0].value).toBe(1400);
    expect(rec.evidence.metrics[1].value).toBe(2800);
    expect(rec.confidence).toBe("high");
  });

  it("stays quiet when the change is inside the noise band", () => {
    const c = channel({ reachByDay: [...days(14, 100, shift(TO, -14)), ...days(14, 95)] });
    expect(decliningTrendRule(facts({ channels: [c] }))).toHaveLength(0);
  });
});

describe("audienceGrowthRule", () => {
  it("flags growth that has more than halved", () => {
    const c = channel({ followerGainByDay: [...days(28, 10, shift(TO, -28)), ...days(28, 2)] });
    const [rec] = audienceGrowthRule(facts({ channels: [c] }));
    expect(rec.kind).toBe("audience_growth_stall");
    expect(rec.evidence.metrics[0].value).toBe(56);
  });

  it("calls out net losses explicitly", () => {
    const c = channel({ followerGainByDay: [...days(28, 10, shift(TO, -28)), ...days(28, -1)] });
    const [rec] = audienceGrowthRule(facts({ channels: [c] }));
    expect(rec.title).toContain("losing followers");
  });
});

describe("inboxResponseLoadRule", () => {
  it("says nothing when the inbox is clear", () => {
    expect(inboxResponseLoadRule(facts())).toHaveLength(0);
  });

  it("uses the workspace target, not an invented one", () => {
    const [rec] = inboxResponseLoadRule(facts({ inbox: { open: 9, unanswered: 6, overdue: 3, medianFirstResponseMinutes: 240, targetMinutes: 60, answeredSample: 25 } }));
    expect(rec.confidence).toBe("high");
    expect(rec.evidence.metrics.find((m) => m.label === "Response target (minutes)")?.value).toBe(60);
    expect(rec.body).toContain("4.0h");
  });
});

describe("computeSlots", () => {
  it("returns nothing below 15 scored posts on the channel", () => {
    expect(computeSlots(channel({ posts: Array.from({ length: 9 }, (_, i) => post(shift(TO, -40 + i))) }))).toHaveLength(0);
  });

  it("scores only buckets with at least 3 posts, best first", () => {
    const good = Array.from({ length: 4 }, (_, i) => post(shift(TO, -70 + i), { weekday: 1, hour: 9, engagement: 30 }));
    const ok = Array.from({ length: 3 }, (_, i) => post(shift(TO, -60 + i), { weekday: 3, hour: 17, engagement: 10 }));
    const lonely = [post(shift(TO, -50), { weekday: 5, hour: 22, engagement: 99 })];
    const filler = Array.from({ length: 8 }, (_, i) => post(shift(TO, -30 + i), { weekday: 6, hour: 12 }));
    const slots = computeSlots(channel({ posts: [...good, ...ok, ...lonely, ...filler] }));
    expect(slots.map((s) => `${s.weekday}:${s.hour}`)).toEqual(["1:9", "3:17", "6:12"]);
    expect(slots[0]).toMatchObject({ score: 0.3, sampleSize: 4 });
  });
});
