import { describe, expect, it, beforeAll } from "vitest";
import { renderReportHtml, renderRollupHtml } from "./index";
import type { ReportDocument, RollupDocument } from "../document";

const PIXEL = "data:image/png;base64,iVBORw0KGgo=";

const appendix: ReportDocument["appendix"] = {
  definitionsVersion: "2026.08.2",
  metrics: [{ name: "Reach", definition: "Accounts that saw your content.", formula: "Σ per-network daily reach", unit: "count", sources: "insights API", freshness: "Expected within 24 h", caveat: "Reach is unique within a network and a day only." }],
  sources: ["insights API"],
  freshnessLabel: "Aug 27, 2026, 6:00 AM",
  staleSources: ["Demo Page (mock) — token expired"],
  caveats: ["Totals across networks are additive, not deduplicated."],
  definitionChanges: ["Reach (Meta), 2026-06-15: Post and Page reach (unique impressions) → Post and Page reach (unique media viewers). Not comparable across that date."],
  revisionNote: "3 stored facts were revised in the last 24 hours.",
};

const doc: ReportDocument = {
  brand: { agencyName: "Northwind Studio", agencyLogo: PIXEL, clientName: "Acme & Co <Ltd>", clientLogo: null, footerText: "Prepared by Northwind Studio", usesClientBrand: false },
  meta: { title: "Monthly performance", periodLabel: "Aug 1 – Aug 27", comparisonLabel: "Jul 5 – Jul 31", generatedAt: "Aug 28, 2026, 8:00 AM", timezone: "Europe/Prague", scopeLabel: "Organic and paid", channelLabel: "All connected channels" },
  scorecard: [
    { name: "Reach", definition: "Accounts that saw your content.", formula: "Σ per-network daily reach", value: "12.4K", previous: "9.8K", deltaLabel: "↑ 26.5%", unavailable: null },
    { name: "ROAS", definition: "Return on ad spend.", formula: "revenue ÷ spend", value: "—", previous: null, deltaLabel: null, unavailable: "Ad imports carry conversion counts but not revenue." },
  ],
  trend: [
    { day: "2026-08-01", network: "instagram", value: 120 },
    { day: "2026-08-02", network: "instagram", value: 180 },
    { day: "2026-08-01", network: "linkedin", value: 40 },
    { day: "2026-08-02", network: "linkedin", value: 65 },
  ],
  trendMetric: "Engagement",
  trendMetricKey: "engagement",
  mix: [{ name: "Acme IG", network: "instagram", value: 300, share: "74.1%" }, { name: "Acme LI", network: "linkedin", value: 105, share: "25.9%" }],
  mixTotal: 405,
  topPosts: [{ title: "Launch day <script>alert(1)</script>", network: "instagram", channelName: "Acme IG", publishedAt: "Aug 12, 2026", url: "https://example.com/p/1", reach: "4.1K", engagement: "310", clicks: "22" }],
  inbox: [{ label: "Unresolved conversations", value: "7", note: "Open or snoozed right now." }],
  paid: { attribution: { model: "provider-reported (last click)", window: "7-day click", sources: "Demo ads", currency: "USD", freshLabel: "Aug 27, 2026" }, rows: [{ label: "Spend", value: "$1,204", note: "Reported by the ad account in USD." }] },
  insights: [{ title: "Post on Tuesdays", body: "Tuesday posts reached more accounts.", confidence: "medium confidence" }],
  appendix,
};

describe("branded report HTML", () => {
  let html = "";
  beforeAll(async () => { html = await renderReportHtml(doc); });

  it("is a complete, self-contained document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<html lang=\"en\">");
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
    expect(html).toContain("<style>");
    expect(html).not.toContain("<script");
  });

  it("references no external host, so it renders offline and in a PDF engine", () => {
    const urls = html.match(/(?:src|href)="([^"]*)"/g) ?? [];
    for (const u of urls) {
      expect(u).not.toMatch(/^(?:src|href)="\/\//);
      if (/^(?:src|href)="https?:/.test(u)) expect(u).toContain("example.com"); // only content links the report is citing
    }
    expect(html).not.toMatch(/<link[^>]+stylesheet/);
    expect(html).toContain(PIXEL);
  });

  it("carries the cover, every section and the definitions appendix", () => {
    for (const marker of ["Monthly performance", "Aug 1 – Aug 27", "Jul 5 – Jul 31", "Headline results", "Engagement over time", "Where the engagement came from", "Top posts", "Conversations and response", "Paid activity", "What we suggest next", "Definitions and data sources"]) {
      expect(html).toContain(marker);
    }
    expect(html).toContain("2026.08.2");
    expect(html).toContain("Definition changes in this range");
    expect(html).toContain("unique media viewers");
    expect(html).toContain("Demo Page (mock)");
    expect(html).toContain("revised in the last 24 hours");
  });

  it("shows an unavailable metric as a dash with its reason, never as zero", () => {
    expect(html).toContain("Ad imports carry conversion counts but not revenue.");
    expect(html).toMatch(/ROAS[\s\S]{0,200}—/);
  });

  it("draws the charts as inline SVG", () => {
    expect(html).toContain("<svg");
    expect(html).toContain("Trend by network");
    expect(html).toContain("Share by network");
    expect(html).toContain("#e1306c"); // network brand colour identifies the series
  });

  it("escapes content that came from user data", () => {
    expect(html).toContain("Acme &amp; Co &lt;Ltd&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});

describe("agency roll-up HTML", () => {
  const rollup: RollupDocument = {
    brand: { agencyName: "Northwind Studio", agencyLogo: null, clientName: "Northwind Studio", clientLogo: null, footerText: "", usesClientBrand: false },
    meta: { title: "Agency overview", periodLabel: "Aug 1 – Aug 27", generatedAt: "Aug 28, 2026, 8:00 AM", scopeLabel: "Organic and paid, per client workspace" },
    clients: [
      { name: "Acme", timezone: "Europe/Prague", periodLabel: "Aug 1 – Aug 27", rows: [{ label: "Posts published", value: "12", note: "Confirmed publications." }], spend: "$1,204 USD", note: null },
      { name: "Globex", timezone: "America/New_York", periodLabel: "Aug 1 – Aug 27", rows: [{ label: "Posts published", value: "4", note: "Confirmed publications." }], spend: "€380 EUR", note: null },
    ],
    appendix,
  };
  let html = "";
  beforeAll(async () => { html = await renderRollupHtml(rollup); });

  it("keeps every client in its own section with no combined total", () => {
    expect(html).toContain("Acme");
    expect(html).toContain("Globex");
    expect(html).toContain("$1,204 USD");
    expect(html).toContain("€380 EUR");
    expect(html).not.toMatch(/Total spend|All clients|Grand total|Combined total/i);
    // One section per client plus the appendix — no aggregate section is ever emitted.
    expect(html.match(/<section/g)).toHaveLength(rollup.clients.length + 1);
    expect(html).toContain("each account reports spend in its own currency");
  });
});
