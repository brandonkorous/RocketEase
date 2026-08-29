import { describe, expect, it } from "vitest";
import { rightsProblemsForPromotion, rightsProblemsForPublish } from "./rules";
import type { RightsAsset, RightsGrant } from "./types";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = d("2026-03-01");

const asset = (over: Partial<RightsAsset> = {}): RightsAsset => ({ id: "a1", fileName: "hero.jpg", rightsScope: "both", rightsExpiresAt: null, ...over });
const grant = (over: Partial<RightsGrant> = {}): RightsGrant => ({
  id: "g1", kind: "ugc_license", scope: "both", label: "Mara spring set", assetId: "a1", channelId: null,
  creatorHandle: "@mara", startsAt: null, expiresAt: null, revokedAt: null, ...over,
});

describe("rightsProblemsForPublish", () => {
  it("says nothing when no clock is recorded", () => {
    expect(rightsProblemsForPublish({}, [asset()], [], d("2026-04-01"), NOW)).toEqual([]);
  });

  it("errors when an asset's rights expire before the scheduled publish, not before today", () => {
    const a = asset({ rightsExpiresAt: d("2026-03-20") });
    expect(rightsProblemsForPublish({}, [a], [], null, NOW)).toEqual([]); // still valid if published now
    const [p] = rightsProblemsForPublish({}, [a], [], d("2026-04-01"), NOW);
    expect(p.severity).toBe("error");
    expect(p.code).toBe("rights_expired");
    expect(p.message).toContain("hero.jpg");
    expect(p.message).toContain("Mar 20, 2026");
    expect(p.message).toContain("Apr 1, 2026");
    expect(p.message).toContain("Renew");
  });

  it("warns 7 days before expiry", () => {
    const a = asset({ rightsExpiresAt: d("2026-03-05") });
    const [p] = rightsProblemsForPublish({}, [a], [], d("2026-03-01"), NOW);
    expect(p.severity).toBe("warning");
    expect(p.code).toBe("rights_expiring");
    expect(rightsProblemsForPublish({}, [asset({ rightsExpiresAt: d("2026-04-05") })], [], d("2026-03-01"), NOW)).toEqual([]);
  });

  it("errors when the asset is cleared for paid use only", () => {
    const [p] = rightsProblemsForPublish({}, [asset({ rightsScope: "paid" })], [], d("2026-03-10"), NOW);
    expect(p.code).toBe("rights_scope");
    expect(p.message).toContain("not organic posting");
  });

  it("applies a grant attached to the asset and one attached to the channel", () => {
    const problems = rightsProblemsForPublish({ channelId: "c1" }, [asset()], [grant({ expiresAt: d("2026-03-10") }), grant({ id: "g2", kind: "spark_code", label: "SPARK-9", assetId: null, channelId: "c1", expiresAt: d("2026-03-11") })], d("2026-03-20"), NOW);
    expect(problems.map((p) => p.clockId)).toEqual(["grant:g1", "grant:g2"]);
    expect(problems[1].message).toContain("Spark code");
  });

  it("ignores grants for other assets and other channels", () => {
    expect(rightsProblemsForPublish({ channelId: "c1" }, [asset()], [grant({ assetId: "other", expiresAt: d("2000-01-01") }), grant({ id: "g3", assetId: null, channelId: "c9", expiresAt: d("2000-01-01") })], d("2026-03-20"), NOW)).toEqual([]);
  });

  it("errors on a revoked or not-yet-started grant", () => {
    const [rev] = rightsProblemsForPublish({}, [asset()], [grant({ revokedAt: d("2026-02-01") })], d("2026-03-20"), NOW);
    expect(rev.code).toBe("rights_revoked");
    const [soon] = rightsProblemsForPublish({}, [asset()], [grant({ startsAt: d("2026-05-01") })], d("2026-03-20"), NOW);
    expect(soon.code).toBe("rights_not_started");
    expect(soon.message).toContain("May 1, 2026");
  });
});

describe("rightsProblemsForPromotion", () => {
  const window = { startAt: d("2026-03-05"), endAt: d("2026-04-05"), channelId: "c1" };

  it("errors when the asset is organic-only", () => {
    const [p] = rightsProblemsForPromotion(window, [asset({ rightsScope: "organic" })], []);
    expect(p.code).toBe("rights_scope");
    expect(p.message).toContain("not paid promotion");
    expect(p.message).toContain("paid usage licence");
  });

  it("errors when a clock ends before the promotion end date", () => {
    const [p] = rightsProblemsForPromotion(window, [asset()], [grant({ scope: "paid", expiresAt: d("2026-03-20") })]);
    expect(p.code).toBe("rights_expired");
    expect(p.message).toContain("the promotion ends on Apr 5, 2026");
  });

  it("uses the start date as the floor when the promotion has no end", () => {
    const open = { startAt: d("2026-03-05"), endAt: null };
    expect(rightsProblemsForPromotion(open, [asset({ rightsExpiresAt: d("2026-06-01") })], [])).toEqual([]);
    const [p] = rightsProblemsForPromotion(open, [asset({ rightsExpiresAt: d("2026-03-01") })], []);
    expect(p.code).toBe("rights_expired");
  });

  it("warns when a spark code runs out within a week of the flight ending", () => {
    const [p] = rightsProblemsForPromotion(window, [asset()], [grant({ kind: "spark_code", scope: "paid", label: "SPARK-9", expiresAt: d("2026-04-08") })]);
    expect(p.severity).toBe("warning");
    expect(p.message).toContain("Spark code");
  });

  it("passes a licence that covers the whole flight", () => {
    expect(rightsProblemsForPromotion(window, [asset({ rightsExpiresAt: d("2026-12-01") })], [grant({ scope: "both", expiresAt: d("2026-12-01") })])).toEqual([]);
  });
});
