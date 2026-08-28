import { describe, expect, it } from "vitest";
import { eventsToRows, MAX_SKEW_SECONDS, newWebhookSecret, parseWebhookBody, signPayload, verifyWebhook } from "./webhook";
import { dimensionHash, isPaidMedium, networkForSource, sourceTokensForNetwork } from "./normalize";

const SECRET = "mis_whsec_test";
const NOW = 1_800_000_000;

describe("verifyWebhook", () => {
  const body = JSON.stringify({ occurredAt: "2026-08-10T10:00:00Z", value: 10 });

  it("accepts a body signed with the timestamp inside the signed material", () => {
    const ts = String(NOW);
    expect(verifyWebhook({ secret: SECRET, rawBody: body, signature: signPayload(SECRET, ts, body), timestamp: ts, nowSeconds: NOW })).toEqual({ ok: true });
  });

  it("rejects a replay outside the skew window even though the signature is valid", () => {
    const ts = String(NOW - MAX_SKEW_SECONDS - 1);
    expect(verifyWebhook({ secret: SECRET, rawBody: body, signature: signPayload(SECRET, ts, body), timestamp: ts, nowSeconds: NOW })).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("rejects a changed body, the wrong secret, and a missing header", () => {
    const ts = String(NOW);
    const sig = signPayload(SECRET, ts, body);
    expect(verifyWebhook({ secret: SECRET, rawBody: body + " ", signature: sig, timestamp: ts, nowSeconds: NOW })).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyWebhook({ secret: "other", rawBody: body, signature: sig, timestamp: ts, nowSeconds: NOW })).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyWebhook({ secret: SECRET, rawBody: body, signature: null, timestamp: ts, nowSeconds: NOW })).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("mints distinct secrets", () => {
    expect(newWebhookSecret()).not.toBe(newWebhookSecret());
    expect(newWebhookSecret().startsWith("mis_whsec_")).toBe(true);
  });
});

describe("parseWebhookBody", () => {
  it("normalizes a single event and defaults its count to one", () => {
    const raw = JSON.stringify({ occurredAt: "2026-08-10T23:30:00Z", value: 25.5, currency: "usd", utm_source: "Instagram", utm_medium: "Social", utm_campaign: "Spring" });
    const out = parseWebhookBody(raw);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.events[0]).toMatchObject({ day: "2026-08-10", value: 25.5, count: 1, currency: "USD", dimension: { utm_source: "instagram", utm_medium: "social", utm_campaign: "spring" } });
  });

  it("derives a stable dedupe id from the body when the sender supplies none", () => {
    const raw = JSON.stringify({ occurredAt: "2026-08-10T10:00:00Z" });
    const a = parseWebhookBody(raw);
    const b = parseWebhookBody(raw);
    expect(a.ok && b.ok && a.events[0].eventId).toBe(b.ok ? b.events[0].eventId : "");
    expect(a.ok && a.events[0].eventId.startsWith("body:")).toBe(true);
  });

  it("keeps the sender's own event id when given", () => {
    const out = parseWebhookBody(JSON.stringify({ eventId: "crm-9182", occurredAt: "2026-08-10T10:00:00Z" }));
    expect(out.ok && out.events[0].eventId).toBe("crm-9182");
  });

  it("accepts a batch and rejects malformed input with a reason", () => {
    const batch = parseWebhookBody(JSON.stringify({ events: [{ occurredAt: "2026-08-10T10:00:00Z", count: 3 }, { occurredAt: "2026-08-11T10:00:00Z" }] }));
    expect(batch.ok && batch.events.map((e) => e.count)).toEqual([3, 1]);
    expect(parseWebhookBody("not json")).toEqual({ ok: false, error: "Body is not valid JSON." });
    expect(parseWebhookBody(JSON.stringify({ occurredAt: "yesterday" }))).toMatchObject({ ok: false });
    expect(parseWebhookBody(JSON.stringify({ occurredAt: "2026-08-10T10:00:00Z", value: -5 }))).toMatchObject({ ok: false });
  });
});

describe("eventsToRows", () => {
  it("sums counts and values per day and UTM, and omits revenue when nothing was worth anything", () => {
    const d = { utm_source: "instagram", utm_medium: "social", utm_campaign: "spring" };
    const h = dimensionHash(d);
    const rows = eventsToRows([
      { day: "2026-08-10", count: 1, value: 10, currency: "USD", dimension: d, dimensionHash: h },
      { day: "2026-08-10", count: 2, value: 5.25, currency: null, dimension: d, dimensionHash: h },
      { day: "2026-08-11", count: 1, value: 0, currency: null, dimension: d, dimensionHash: h },
    ]);
    expect(rows).toEqual([
      { day: "2026-08-10", metric: "conversions", value: 3, dimension: d, source: "webhook.event" },
      { day: "2026-08-10", metric: "revenue", value: 15.25, currency: "USD", dimension: d, source: "webhook.event.value" },
      { day: "2026-08-11", metric: "conversions", value: 1, dimension: d, source: "webhook.event" },
    ]);
  });
});

describe("utm normalization", () => {
  it("maps vendor source aliases onto one network and back", () => {
    expect(networkForSource("ig")).toBe("instagram");
    expect(networkForSource("t.co")).toBe("x");
    expect(networkForSource("someblog")).toBeUndefined();
    expect(sourceTokensForNetwork("instagram")).toContain("instagram.com");
  });

  it("separates paid mediums so site and ad conversions are never double counted", () => {
    expect(isPaidMedium("paid_social")).toBe(true);
    expect(isPaidMedium("social")).toBe(false);
    expect(isPaidMedium(undefined)).toBe(false);
  });

  it("hashes only the UTM triple, so resolved ids never split a grain", () => {
    const base = { utm_source: "instagram", utm_medium: "social", utm_campaign: "spring" };
    expect(dimensionHash(base)).toBe(dimensionHash({ ...base, channelId: "ch_1", campaignId: "cp_1" }));
    expect(dimensionHash(base)).not.toBe(dimensionHash({ ...base, utm_campaign: "summer" }));
  });
});
