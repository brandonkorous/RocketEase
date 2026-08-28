import { describe, expect, it } from "vitest";
import { conversionProvenance, trackingUnavailable } from "./availability";
import type { ConversionState, ConversionSourceView } from "./conversions";

const source = (over: Partial<ConversionSourceView> = {}): ConversionSourceView => ({
  id: "src_1",
  kind: "ga4",
  kindLabel: "Google Analytics 4",
  name: "Acme storefront",
  status: "healthy",
  lastSyncAt: new Date("2026-08-27T06:00:00Z"),
  window: "GA4 session-scoped attribution, property default lookback",
  message: null,
  ...over,
});

const state = (over: Partial<ConversionState> = {}): ConversionState => ({ sources: [], healthy: 0, total: 0, hasRevenue: false, currencies: [], lastSyncAt: null, ...over });
const withSource = (s: ConversionSourceView, over: Partial<ConversionState> = {}) =>
  state({ sources: [s], total: 1, healthy: s.status === "healthy" ? 1 : 0, lastSyncAt: s.lastSyncAt, ...over });

describe("trackingUnavailable", () => {
  it("names the missing piece when nothing is connected", () => {
    expect(trackingUnavailable("conversions", state(), {})).toContain("Settings → Tracking");
    expect(trackingUnavailable("revenue", state(), {})).toContain("Settings → Tracking");
    expect(trackingUnavailable("sessions", state(), {})).toContain("Google Analytics 4");
  });

  it("returns undefined for metrics a tracking source has no say over", () => {
    expect(trackingUnavailable("reach", state(), {})).toBeUndefined();
    expect(trackingUnavailable("spend", state(), {})).toBeUndefined();
  });

  it("shows ad-reported conversions even with no tracking source", () => {
    expect(trackingUnavailable("conversions", state(), { conversions: 12 })).toBeNull();
  });

  it("explains a degraded source instead of showing a number", () => {
    const why = trackingUnavailable("conversions", withSource(source({ status: "action_required", message: "Token expired." })), {});
    expect(why).toContain("Acme storefront");
    expect(why).toContain("Token expired.");
  });

  it("distinguishes 'no source' from 'source reports no revenue'", () => {
    const healthyNoRevenue = withSource(source());
    expect(trackingUnavailable("revenue", healthyNoRevenue, {})).toContain("has not reported any revenue");
    expect(trackingUnavailable("revenue", { ...healthyNoRevenue, hasRevenue: true }, {})).toBeNull();
  });

  it("blocks ROAS on missing revenue first, then on missing spend", () => {
    const revenueless = withSource(source());
    expect(trackingUnavailable("roas", revenueless, { spend: 100 })).toContain("has not reported any revenue");
    const withRevenue = { ...revenueless, hasRevenue: true };
    expect(trackingUnavailable("roas", withRevenue, {})).toContain("No paid spend");
    expect(trackingUnavailable("roas", withRevenue, { spend: 100 })).toBeNull();
  });

  it("keeps sessions unavailable when the only source is a webhook", () => {
    const webhookOnly = withSource(source({ kind: "webhook", kindLabel: "Conversion webhook", name: "HubSpot deals" }));
    expect(trackingUnavailable("sessions", webhookOnly, {})).toContain("Google Analytics 4");
    expect(trackingUnavailable("conversions", webhookOnly, {})).toBeNull();
  });
});

describe("conversionProvenance", () => {
  it("is null with no sources and reports model, window, and currency otherwise", () => {
    expect(conversionProvenance(state())).toBeNull();
    const p = conversionProvenance(withSource(source(), { currencies: ["USD"] }))!;
    expect(p.model).toBe("UTM last-click (source-reported)");
    expect(p.window).toContain("GA4 session-scoped");
    expect(p.sources).toEqual(["Acme storefront (Google Analytics 4)"]);
    expect(p.currency).toBe("USD");
  });

  it("flags a mixed-currency workspace rather than converting", () => {
    expect(conversionProvenance(withSource(source(), { currencies: ["USD", "EUR"] }))!.currency).toBe("mixed (USD, EUR)");
    expect(conversionProvenance(withSource(source()))!.currency).toBe("not reported");
  });
});
