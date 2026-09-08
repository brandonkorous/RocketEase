import { describe, expect, it } from "vitest";
import { generateLicenceKeyPair, signLicence, verifyLicence } from "./format";
import { LICENCE_GRACE_DAYS, licenceFeatures, licenceFrom } from "./state";

const NOW = new Date("2026-09-06T12:00:00Z");
const pair = generateLicenceKeyPair();
const base = { v: 1 as const, id: "nw-2026", licensee: "Northwind Agency", issuedAt: "2026-09-01T00:00:00Z", expiresAt: "2027-09-01T00:00:00Z", workspaces: 25, features: ["media.generation"], channel: "stable" as const };

describe("licence format", () => {
  it("round-trips a signed payload and refuses a tampered one", () => {
    const key = signLicence(base, pair.privateKey);
    expect(key.startsWith("RE1.")).toBe(true);
    expect(verifyLicence(key, pair.publicKey)).toEqual({ ok: true, payload: base });
    const [p, body, sig] = key.split(".");
    const forged = Buffer.from(JSON.stringify({ ...base, workspaces: null })).toString("base64url");
    expect(verifyLicence(`${p}.${forged}.${sig}`, pair.publicKey)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyLicence(`${p}.${body}.${sig}`, generateLicenceKeyPair().publicKey)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("names why a key cannot be used", () => {
    expect(verifyLicence("not-a-key", pair.publicKey)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyLicence("RE9.a.b", pair.publicKey)).toEqual({ ok: false, reason: "unsupported" });
    expect(verifyLicence(signLicence(base, pair.privateKey), null)).toEqual({ ok: false, reason: "no_public_key" });
    expect(verifyLicence(signLicence(base, pair.privateKey), "nope")).toEqual({ ok: false, reason: "no_public_key" });
  });
});

describe("licence state", () => {
  it("is licensed before expiry, in grace for 30 days after, then expired — and no key is unlicensed with no reason", () => {
    const check = verifyLicence(signLicence(base, pair.privateKey), pair.publicKey);
    expect(licenceFrom(check, NOW).state).toBe("licensed");
    const dayAfter = new Date("2027-09-02T00:00:00Z");
    const grace = licenceFrom(check, dayAfter);
    expect(grace.state).toBe("licence_grace");
    expect(grace.graceUntil).toEqual(new Date(Date.parse(base.expiresAt) + LICENCE_GRACE_DAYS * 86_400_000));
    expect(licenceFrom(check, new Date("2027-10-02T00:00:00Z")).state).toBe("licence_expired");
    expect(licenceFrom(null, NOW)).toMatchObject({ state: "unlicensed", reason: null });
    expect(licenceFrom({ ok: false, reason: "bad_signature" }, NOW).reason).toMatch(/signature/);
  });

  it("grants the licence's features only while it is in force", () => {
    const check = verifyLicence(signLicence(base, pair.privateKey), pair.publicKey);
    expect(licenceFeatures(licenceFrom(check, NOW))).toEqual(["media.generation"]);
    expect(licenceFeatures(licenceFrom(check, new Date("2027-09-02T00:00:00Z")))).toEqual(["media.generation"]);
    expect(licenceFeatures(licenceFrom(check, new Date("2028-01-01T00:00:00Z")))).toEqual([]);
  });
});
