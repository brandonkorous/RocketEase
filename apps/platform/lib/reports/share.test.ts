import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_SHARE_DAYS, MAX_SHARE_DAYS, hashPasscode, hashToken, isWellFormedToken, mintShareToken, passcodeProof, shareExpiry, shareState, truncateVisitor, verifyPasscode } from "./share";
import { rateLimit, resetRateLimits } from "./rate-limit";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-for-report-shares";
});

describe("share tokens", () => {
  it("mints a signed token whose hash is what gets stored", () => {
    const { token, hash } = mintShareToken();
    expect(isWellFormedToken(token)).toBe(true);
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("mints a different token every time", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => mintShareToken().token));
    expect(tokens.size).toBe(50);
  });

  it("rejects forged, truncated and mutated tokens before any lookup", () => {
    const { token } = mintShareToken();
    const [body, sig] = token.split(".");
    expect(isWellFormedToken("")).toBe(false);
    expect(isWellFormedToken(body)).toBe(false);
    expect(isWellFormedToken(`${body}.${sig.slice(0, -1)}`)).toBe(false);
    expect(isWellFormedToken(`${body}x.${sig}`)).toBe(false);
    expect(isWellFormedToken(`${body}.${"a".repeat(sig.length)}`)).toBe(false);
    expect(isWellFormedToken("../../etc/passwd")).toBe(false);
    expect(isWellFormedToken("a".repeat(200))).toBe(false);
  });

  it("does not validate a token signed with a different secret", () => {
    const { token } = mintShareToken();
    process.env.BETTER_AUTH_SECRET = "a-completely-different-secret";
    expect(isWellFormedToken(token)).toBe(false);
    process.env.BETTER_AUTH_SECRET = "test-secret-for-report-shares";
    expect(isWellFormedToken(token)).toBe(true);
  });
});

describe("expiry", () => {
  it("defaults to 30 days and clamps to the maximum", () => {
    const from = new Date("2026-08-28T00:00:00Z");
    expect(shareExpiry(DEFAULT_SHARE_DAYS, from).toISOString()).toBe("2026-09-27T00:00:00.000Z");
    expect(shareExpiry(9999, from).getTime()).toBe(from.getTime() + MAX_SHARE_DAYS * 86_400_000);
    expect(shareExpiry(0, from).getTime()).toBe(from.getTime() + 86_400_000);
  });

  it("reports revoked before expired, and expiry at the boundary", () => {
    const now = new Date("2026-08-28T12:00:00Z");
    expect(shareState({ expiresAt: new Date("2026-09-01T00:00:00Z"), revokedAt: null }, now)).toBe("ok");
    expect(shareState({ expiresAt: new Date("2026-08-28T12:00:00Z"), revokedAt: null }, now)).toBe("expired");
    expect(shareState({ expiresAt: new Date("2026-09-01T00:00:00Z"), revokedAt: now }, now)).toBe("revoked");
    expect(shareState({ expiresAt: new Date("2026-01-01T00:00:00Z"), revokedAt: now }, now)).toBe("revoked");
  });
});

describe("passcodes", () => {
  it("hashes with a per-row salt and verifies only the right passcode", () => {
    const a = hashPasscode("open-sesame");
    const b = hashPasscode("open-sesame");
    expect(a).not.toBe(b);
    expect(a).not.toContain("open-sesame");
    expect(verifyPasscode("open-sesame", a)).toBe(true);
    expect(verifyPasscode("open-sesam", a)).toBe(false);
    expect(verifyPasscode("", a)).toBe(false);
    expect(verifyPasscode("anything", null)).toBe(true);
    expect(verifyPasscode("anything", "garbage")).toBe(false);
  });

  it("binds the proof cookie to both the share and the stored hash", () => {
    const hash = hashPasscode("x1234");
    expect(passcodeProof("share-1", hash)).toBe(passcodeProof("share-1", hash));
    expect(passcodeProof("share-1", hash)).not.toBe(passcodeProof("share-2", hash));
    expect(passcodeProof("share-1", hash)).not.toBe(passcodeProof("share-1", hashPasscode("x1234")));
  });
});

describe("visitor fingerprints", () => {
  it("never keeps a full address or user agent", () => {
    expect(truncateVisitor("203.0.113.42", "Mozilla/5.0 ".repeat(40)).ip).toBe("203.0.x.x");
    expect(truncateVisitor("2001:db8:85a3::8a2e", null).ip).toBe("2001:db8::");
    expect(truncateVisitor(null, null)).toEqual({ ip: null, userAgent: null });
    expect(truncateVisitor("203.0.113.42", "x".repeat(500)).userAgent).toHaveLength(80);
  });
});

describe("rate limiting", () => {
  it("allows up to the limit inside a window and recovers after it", () => {
    resetRateLimits();
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) expect(rateLimit("k", 5, 60_000, now).ok).toBe(true);
    const blocked = rateLimit("k", 5, 60_000, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(rateLimit("other", 5, 60_000, now).ok).toBe(true);
    expect(rateLimit("k", 5, 60_000, now + 60_001).ok).toBe(true);
  });
});
