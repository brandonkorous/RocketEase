import { describe, expect, it } from "vitest";
import { consentDaysLeft, decideConsent, missingConsentFields, needsOwnerAuthorisation, type ConsentRow } from "./policy";

const NOW = new Date("2026-08-30T00:00:00Z");

const complete = (over: Partial<ConsentRow> = {}): ConsentRow => ({
  kind: "cloned",
  label: "Founder VO",
  consentPersonName: "Dana Reyes",
  consentEvidenceAssetId: "asset-release-1",
  authorisedByUserId: "user-owner",
  authorisedAt: new Date("2026-01-01T00:00:00Z"),
  expiresAt: new Date("2027-01-01T00:00:00Z"),
  scope: "both",
  revokedAt: null,
  ...over,
});

describe("stock voices", () => {
  it("are always allowed — that asymmetry is the whole design", () => {
    const stock: ConsentRow = { ...complete(), kind: "stock", consentPersonName: null, consentEvidenceAssetId: null, authorisedByUserId: null, authorisedAt: null, expiresAt: null };
    expect(decideConsent(stock, "paid", NOW)).toEqual({ allowed: true, reason: "stock" });
  });

  it("need no owner authorisation, unlike every replica", () => {
    expect(needsOwnerAuthorisation("stock")).toBe(false);
    expect(needsOwnerAuthorisation("cloned")).toBe(true);
    expect(needsOwnerAuthorisation("likeness")).toBe(true);
  });

  it("have no consent clock to count down", () => {
    expect(consentDaysLeft({ ...complete(), kind: "stock" }, NOW)).toBeNull();
  });
});

describe("a complete record", () => {
  it("allows the use it covers", () => {
    expect(decideConsent(complete(), "paid", NOW)).toEqual({ allowed: true, reason: "consented" });
  });

  it("allows a likeness on the same terms as a cloned voice", () => {
    expect(decideConsent(complete({ kind: "likeness" }), "organic", NOW).allowed).toBe(true);
  });

  it("counts down to expiry", () => {
    expect(consentDaysLeft(complete({ expiresAt: new Date("2026-09-09T00:00:00Z") }), NOW)).toBe(10);
  });
});

describe("incomplete consent", () => {
  it("names every missing part rather than saying “invalid”", () => {
    const row = complete({ consentPersonName: null, consentEvidenceAssetId: null });
    expect(missingConsentFields(row)).toEqual(["whose voice this is", "the signed release or recording"]);
    const decision = decideConsent(row, "organic", NOW);
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.message).toContain("whose voice this is");
  });

  it("refuses a replica with no evidence, however plausible the name", () => {
    const d = decideConsent(complete({ consentEvidenceAssetId: null }), "organic", NOW);
    expect(d.allowed === false && d.code).toBe("incomplete");
  });

  it("refuses consent with no end date — that is not consent we will rely on", () => {
    const d = decideConsent(complete({ expiresAt: null }), "organic", NOW);
    expect(d.allowed === false && d.code).toBe("incomplete");
  });

  it("refuses a replica nobody authorised in the product", () => {
    const d = decideConsent(complete({ authorisedByUserId: null }), "organic", NOW);
    expect(d.allowed === false && d.code).toBe("incomplete");
  });
});

describe("clocks and scope", () => {
  it("refuses expired consent and names the date", () => {
    const d = decideConsent(complete({ expiresAt: new Date("2026-08-01T00:00:00Z") }), "organic", NOW);
    expect(d.allowed === false && d.code).toBe("expired");
    expect(d.allowed === false && d.message).toContain("2026-08-01");
  });

  it("treats expiry as exclusive — consent ending now is already over", () => {
    expect(decideConsent(complete({ expiresAt: NOW }), "organic", NOW).allowed).toBe(false);
  });

  it("refuses ORGANIC-only consent for a paid ad, and says which is which", () => {
    const d = decideConsent(complete({ scope: "organic" }), "paid", NOW);
    expect(d.allowed === false && d.code).toBe("out_of_scope");
    expect(d.allowed === false && d.message).toContain("organic use only");
  });

  it("allows organic-only consent for organic use", () => {
    expect(decideConsent(complete({ scope: "organic" }), "organic", NOW).allowed).toBe(true);
  });

  it("refuses paid-only consent for an organic post — scope cuts both ways", () => {
    expect(decideConsent(complete({ scope: "paid" }), "organic", NOW).allowed).toBe(false);
  });
});

describe("withdrawal", () => {
  it("is permanent, and beats an otherwise perfect record", () => {
    const d = decideConsent(complete({ revokedAt: new Date("2026-08-01T00:00:00Z") }), "organic", NOW);
    expect(d.allowed === false && d.code).toBe("revoked");
    expect(d.allowed === false && d.message).toContain("withdrawn");
  });

  it("does not apply before it takes effect", () => {
    expect(decideConsent(complete({ revokedAt: new Date("2026-12-01T00:00:00Z") }), "organic", NOW).allowed).toBe(true);
  });
});

describe("unknown kinds", () => {
  it("are refused rather than treated as stock", () => {
    const d = decideConsent({ ...complete(), kind: "avatar" as never }, "organic", NOW);
    expect(d.allowed === false && d.code).toBe("unknown_kind");
  });
});
