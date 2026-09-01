import { describe, expect, it } from "vitest";
import { describeNarrowing, mergeRights, type RightsBearing } from "./rights-merge";

const src = (over: Partial<RightsBearing> = {}): RightsBearing => ({
  rightsScope: "both",
  rightsExpiresAt: null,
  licenseSource: "owned",
  platformClearance: {},
  ...over,
});

describe("mergeRights", () => {
  it("is permissive for nothing at all, rather than blocking everything", () => {
    expect(mergeRights([])).toEqual({ rightsScope: "both", rightsExpiresAt: null, licenseSource: "owned", platformClearance: {} });
  });

  it("takes the NARROWEST scope, wherever it lives", () => {
    expect(mergeRights([src(), src({ rightsScope: "organic" }), src()]).rightsScope).toBe("organic");
  });

  it("prefers organic over paid when both appear — a cut cannot be either", () => {
    expect(mergeRights([src({ rightsScope: "paid" }), src({ rightsScope: "organic" })]).rightsScope).toBe("organic");
  });

  it("takes the EARLIEST clock, even when it is on a different asset than the scope", () => {
    const merged = mergeRights([
      src({ rightsScope: "organic", rightsExpiresAt: new Date("2027-01-01") }),
      src({ rightsExpiresAt: new Date("2026-09-01") }),
    ]);
    expect(merged.rightsScope).toBe("organic");
    expect(merged.rightsExpiresAt).toEqual(new Date("2026-09-01"));
  });

  it("does not let an unexpiring asset lift another's clock", () => {
    expect(mergeRights([src(), src({ rightsExpiresAt: new Date("2026-09-01") })]).rightsExpiresAt).toEqual(new Date("2026-09-01"));
  });

  it("lets a PLATFORM-LIBRARY track poison the whole cut", () => {
    expect(mergeRights([src(), src({ licenseSource: "platform_library" })]).licenseSource).toBe("platform_library");
  });

  it("ranks stock below ai_generated and owned", () => {
    expect(mergeRights([src({ licenseSource: "owned" }), src({ licenseSource: "stock" }), src({ licenseSource: "ai_generated" })]).licenseSource).toBe("stock");
  });

  it("blocks a network if ANY ingredient blocks it — the music trap", () => {
    const merged = mergeRights([
      src({ platformClearance: { meta: true, tiktok: true } }),
      src({ platformClearance: { tiktok: false } }),
    ]);
    expect(merged.platformClearance).toEqual({ meta: true, tiktok: false });
  });

  it("keeps a block regardless of the order the ingredients arrive in", () => {
    const a = src({ platformClearance: { tiktok: false } });
    const b = src({ platformClearance: { tiktok: true } });
    expect(mergeRights([a, b]).platformClearance.tiktok).toBe(false);
    expect(mergeRights([b, a]).platformClearance.tiktok).toBe(false);
  });

  it("survives an ingredient with no clearance map at all", () => {
    const missing = { ...src(), platformClearance: undefined as unknown as Record<string, boolean> };
    expect(mergeRights([missing, src({ platformClearance: { meta: true } })]).platformClearance).toEqual({ meta: true });
  });
});

describe("describeNarrowing", () => {
  it("says nothing when nothing was narrowed", () => {
    const sources = [src(), src()];
    expect(describeNarrowing(mergeRights(sources), sources)).toBeNull();
  });

  it("names organic-only use", () => {
    const sources = [src({ rightsScope: "organic" })];
    expect(describeNarrowing(mergeRights(sources), sources)).toContain("organic use only");
  });

  it("calls out a platform-library track specifically", () => {
    const sources = [src({ licenseSource: "platform_library" })];
    expect(describeNarrowing(mergeRights(sources), sources)).toContain("can't travel between networks");
  });

  it("lists every blocked network", () => {
    const sources = [src({ platformClearance: { tiktok: false, youtube: false, meta: true } })];
    const note = describeNarrowing(mergeRights(sources), sources)!;
    expect(note).toContain("tiktok");
    expect(note).toContain("youtube");
    expect(note).not.toContain("meta,");
  });

  it("mentions an inherited expiry only when some ingredient had none", () => {
    const inherited = [src({ rightsExpiresAt: new Date("2026-09-01") }), src()];
    expect(describeNarrowing(mergeRights(inherited), inherited)).toContain("2026-09-01");

    const shared = [src({ rightsExpiresAt: new Date("2026-09-01") }), src({ rightsExpiresAt: new Date("2026-10-01") })];
    expect(describeNarrowing(mergeRights(shared), shared)).toBeNull();
  });
});
