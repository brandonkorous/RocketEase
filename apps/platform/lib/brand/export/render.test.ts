import { beforeAll, describe, expect, it } from "vitest";
import { EMPTY_KIT } from "../read";
import type { BrandDocument } from "./document";
import { renderBrandKitHtml } from "./render";

const PIXEL = "data:image/png;base64,iVBORw0KGgo=";

const doc: BrandDocument = {
  meta: { title: "Northwind <Ltd> brand kit", workspaceName: "Northwind", generatedAt: "Sep 5, 2026, 1:00 PM", timezone: "America/Los_Angeles", today: "2026-09-05" },
  preparedBy: { name: "Studio & Co", logo: PIXEL },
  kit: {
    ...EMPTY_KIT,
    identity: { ...EMPTY_KIT.identity, displayName: "Northwind <Ltd>", oneLiner: "Coffee, roasted in Visalia.", website: "https://northwind.example", links: [{ label: "Shop", url: "https://northwind.example/shop" }] },
    voice: { tone: "Warm, plain", audience: "Regulars", doList: ["Say hello"], dontList: ["Hype"], examples: ["Fresh batch today.\nCome by."] },
    voiceRules: { bannedWords: ["synergy"], emoji: "sparing", spelling: "us", readingLevel: "", ctaStyle: "" },
    visual: { ...EMPTY_KIT.visual, palette: [{ name: "Ink", hex: "#0a0a0a", role: "primary", note: "" }, { name: "Bad", hex: "javascript:alert(1)", role: "accent", note: "" }], typography: { headingFamily: "Inter", bodyFamily: "Inter", weights: "400/700", licenceNote: "Open Font Licence" } },
    messaging: { ...EMPTY_KIT.messaging, boilerplate: "Northwind roasts coffee.", offers: [{ name: "Summer", detail: "10% off", expiresAt: "2026-08-01" }, { name: "Autumn", detail: "Free cup", expiresAt: "2026-10-01" }] },
    rules: { ...EMPTY_KIT.rules, claimRules: ['No "best in the UK"'], competitorPolicy: "no_names" },
  },
  logos: [{ role: "primary", label: "Primary", dataUri: PIXEL, note: "" }, { role: "mark", label: "Mark only", dataUri: null, note: "" }],
  assets: [{ title: "hero.jpg", size: "1080 × 1350", rights: "Rights: owned" }],
};

describe("brand kit document", () => {
  let html = "";
  beforeAll(async () => { html = await renderBrandKitHtml(doc); });

  it("is one self-contained document with the kit's words in it", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Northwind &lt;Ltd&gt; brand kit</title>");
    expect(html).toContain("Coffee, roasted in Visalia.");
    expect(html).toContain("Northwind roasts coffee.");
    expect(html).toContain("synergy");
    expect(html).toContain("cannot be scheduled in RocketEase");
    expect(html).toContain("No &quot;best in the UK&quot;");
    expect(html).toContain("never name a competitor");
    expect(html).not.toContain("<script");
  });

  it("inlines logos and says which ones it could not", () => {
    // The agency mark on the cover, the brand's primary logo on the cover, and the primary logo again in the logo grid.
    expect(html.split(PIXEL).length - 1).toBe(3);
    expect(html).toContain("1 logo file(s) could not be embedded");
  });

  it("paints only a valid hex, and marks an expired offer", () => {
    expect(html).toContain("background:#0a0a0a");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("2026-08-01 (expired)");
    expect(html).toContain("2026-10-01</td>");
  });

  it("says what is missing instead of inventing it", () => {
    expect(html).toContain("Not recorded yet.");
    expect(html).toContain("Prepared by Studio &amp; Co.");
  });
});
