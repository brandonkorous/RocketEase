import { describe, expect, it } from "vitest";
import { decideAccess, isBetaFeature, parseBetaEnv, type GrantRow } from "./policy";

const NOW = new Date("2026-08-30T12:00:00Z");
const row = (state: GrantRow["state"], expiresAt: Date | null = null): GrantRow => ({ state, expiresAt });

describe("decideAccess", () => {
  it("is closed by default", () => {
    expect(decideAccess(null, false, NOW)).toEqual({ allowed: false, reason: "not_granted" });
  });

  it("opens on an enabled row", () => {
    expect(decideAccess(row("enabled"), false, NOW)).toEqual({ allowed: true, reason: "granted" });
  });

  it("opens on the env bootstrap when there is no row", () => {
    expect(decideAccess(null, true, NOW)).toEqual({ allowed: true, reason: "granted_env" });
  });

  it("lets an explicit revoke beat the env bootstrap", () => {
    expect(decideAccess(row("disabled"), true, NOW)).toEqual({ allowed: false, reason: "revoked" });
  });

  it("closes an expired grant, and distinguishes it from a revoke", () => {
    const expired = row("enabled", new Date("2026-08-29T12:00:00Z"));
    expect(decideAccess(expired, false, NOW)).toEqual({ allowed: false, reason: "expired" });
  });

  it("keeps a grant that has not reached its expiry", () => {
    expect(decideAccess(row("enabled", new Date("2026-09-30T00:00:00Z")), false, NOW).allowed).toBe(true);
  });

  it("expires exactly at the boundary rather than a moment later", () => {
    expect(decideAccess(row("enabled", NOW), false, NOW).reason).toBe("expired");
  });

  it("does not let the env bootstrap resurrect an expired grant", () => {
    expect(decideAccess(row("enabled", new Date("2026-01-01T00:00:00Z")), true, NOW).allowed).toBe(false);
  });
});

describe("parseBetaEnv", () => {
  it("reads feature:organization pairs", () => {
    const g = parseBetaEnv("media.generation:org_a,media.generation:org_b");
    expect([...(g.get("media.generation") ?? [])]).toEqual(["org_a", "org_b"]);
  });

  it("tolerates whitespace and empty entries", () => {
    const g = parseBetaEnv(" media.generation : org_a ,, ");
    expect(g.get("media.generation")?.has("org_a")).toBe(true);
  });

  it("ignores unknown feature keys rather than trusting them", () => {
    expect(parseBetaEnv("not.a.beta:org_a").size).toBe(0);
  });

  it("ignores an entry with no organization", () => {
    expect(parseBetaEnv("media.generation:").size).toBe(0);
  });

  it("is empty for undefined and for an empty string", () => {
    expect(parseBetaEnv(undefined).size).toBe(0);
    expect(parseBetaEnv("").size).toBe(0);
  });
});

describe("isBetaFeature", () => {
  it("accepts a known beta and rejects anything else", () => {
    expect(isBetaFeature("media.generation")).toBe(true);
    expect(isBetaFeature("media")).toBe(false);
    expect(isBetaFeature("")).toBe(false);
  });
});
