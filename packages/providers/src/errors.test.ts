import { describe, expect, it } from "vitest";
import { mapGraphError } from "./meta/graph";
import { mapLinkedInError } from "./linkedin/client";
import { mapBusinessError, mapTikTokError } from "./tiktok/client";
import { retryAfterSeconds } from "./health";

const h = (v: Record<string, string>) => new Headers(v);

describe("mapGraphError (Meta)", () => {
  it("maps expired tokens to permission", () => {
    const e = mapGraphError(400, { error: { message: "Error validating access token", code: 190, error_subcode: 463 } });
    expect(e.category).toBe("permission");
    expect(e.providerCode).toBe("190/463");
    expect(e.retryable).toBe(false);
  });
  it("maps throttling to rate_limit with a retry hint", () => {
    const e = mapGraphError(400, { error: { message: "Application request limit reached", code: 4 } });
    expect(e.category).toBe("rate_limit");
    expect(e.retryAfterSeconds).toBe(300);
    expect(e.retryable).toBe(true);
  });
  it("flags mutating 5xx as ambiguous", () => {
    expect(mapGraphError(500, { error: { code: 1, message: "unknown" } }, true)).toMatchObject({ category: "temporary", ambiguous: true });
  });
  it("maps policy blocks", () => {
    expect(mapGraphError(400, { error: { code: 368, message: "blocked" } }).category).toBe("policy");
  });
});

describe("mapLinkedInError", () => {
  it("maps 401/403 and token codes to permission", () => {
    expect(mapLinkedInError(401, { message: "Invalid access token", serviceErrorCode: 65600 }).category).toBe("permission");
    expect(mapLinkedInError(403, { message: "Not enough permissions", status: 403 }).category).toBe("permission");
    expect(mapLinkedInError(401, { code: "REVOKED_ACCESS_TOKEN" }).providerCode).toBe("REVOKED_ACCESS_TOKEN");
  });
  it("maps 429 to rate_limit honouring Retry-After", () => {
    const e = mapLinkedInError(429, { message: "Throttled" }, { headers: h({ "retry-after": "120" }) });
    expect(e.category).toBe("rate_limit");
    expect(e.retryAfterSeconds).toBe(120);
    expect(mapLinkedInError(429, null).retryAfterSeconds).toBe(3600);
  });
  it("maps 400/422 to validation, 404 to deleted, mutating 5xx to ambiguous", () => {
    expect(mapLinkedInError(422, { message: "bad" }).category).toBe("validation");
    expect(mapLinkedInError(404, "Not found").category).toBe("deleted");
    expect(mapLinkedInError(502, null, { ambiguous: true })).toMatchObject({ category: "temporary", ambiguous: true, retryable: true });
  });
});

describe("mapTikTokError (open.tiktokapis.com)", () => {
  it("maps token and scope codes to permission", () => {
    expect(mapTikTokError(401, { error: { code: "access_token_invalid", message: "x" } }).category).toBe("permission");
    expect(mapTikTokError(403, { error: { code: "scope_not_authorized", message: "x" } }).category).toBe("permission");
  });
  it("maps rate limits with Retry-After, validation and policy codes", () => {
    expect(mapTikTokError(429, { error: { code: "rate_limit_exceeded", message: "x" } }, { headers: h({ "retry-after": "5" }) })).toMatchObject({ category: "rate_limit", retryAfterSeconds: 5 });
    expect(mapTikTokError(400, { error: { code: "invalid_params", message: "x" } }).category).toBe("validation");
    expect(mapTikTokError(400, { error: { code: "spam_risk_too_many_posts", message: "x" } }).category).toBe("policy");
  });
  it("treats internal_error on a mutation as ambiguous temporary", () => {
    expect(mapTikTokError(500, { error: { code: "internal_error", message: "x" } }, { ambiguous: true })).toMatchObject({ category: "temporary", ambiguous: true });
  });
});

describe("mapBusinessError (business-api.tiktok.com)", () => {
  it("maps numeric envelopes", () => {
    expect(mapBusinessError(200, { code: 40100, message: "token expired" }).category).toBe("permission");
    expect(mapBusinessError(200, { code: 40001, message: "param" }).category).toBe("validation");
    expect(mapBusinessError(200, { code: 50000, message: "server" }).category).toBe("temporary");
    expect(mapBusinessError(429, { code: 40016, message: "rate" }).category).toBe("rate_limit");
  });
});

describe("retryAfterSeconds", () => {
  it("parses seconds and HTTP dates", () => {
    expect(retryAfterSeconds(h({ "retry-after": "30" }))).toBe(30);
    const later = new Date(Date.now() + 90_000).toUTCString();
    const v = retryAfterSeconds(h({ "retry-after": later }))!;
    expect(v).toBeGreaterThanOrEqual(88);
    expect(v).toBeLessThanOrEqual(91);
    expect(retryAfterSeconds(undefined, 7)).toBe(7);
  });
});
