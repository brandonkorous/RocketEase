import { describe, expect, it } from "vitest";
import { readBrandKit } from "@/lib/brand/read";
import { starterPlan } from "@/lib/media/plan/starter";
import type { AdPlan } from "@/lib/media/plan/types";
import { expandVariants } from "@/lib/media/plan/variants";
import { resolveRenderSpec } from "@/lib/media/compose/spec";
import type { RenderResult } from "@/lib/media/compose/render";
import { preflightPlan } from "./plan";
import { preflightRender } from "./render";
import { blocking, passes, type PreflightAsset } from "./types";

const NOW = new Date("2026-08-30T00:00:00Z");

const asset = (over: Partial<PreflightAsset> = {}): PreflightAsset => ({
  id: "a1",
  fileName: "packshot.jpg",
  kind: "image",
  width: 2160,
  height: 3840,
  durationSeconds: null,
  uploadStatus: "ready",
  scanStatus: "clean",
  rightsScope: "both",
  rightsExpiresAt: null,
  licenseSource: "owned",
  platformClearance: {},
  generatedByAi: false,
  ...over,
});

const plan = (): AdPlan =>
  starterPlan({ objective: "sales", title: "Spring", placements: ["meta_reels_9x16"], headline: "Half price", cta: "Shop now", assetId: "a1" });

const run = (p: AdPlan, a: PreflightAsset | null = asset()) =>
  preflightPlan({ plan: p, kit: readBrandKit({}), assets: a ? new Map([[a.id, a]]) : new Map(), now: NOW });

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("preflightPlan — rights", () => {
  it("blocks an expired licence and says how long ago", () => {
    const issues = run(plan(), asset({ rightsExpiresAt: new Date("2026-08-25T00:00:00Z") }));
    const expired = issues.find((i) => i.code === "rights_expired")!;
    expect(expired.severity).toBe("error");
    expect(expired.message).toContain("5 days ago");
  });

  it("warns before a licence lapses, because an ad flight outlives the warning window", () => {
    const issues = run(plan(), asset({ rightsExpiresAt: new Date("2026-09-05T00:00:00Z") }));
    expect(codes(issues)).toContain("rights_expiring");
    expect(passes(issues)).toBe(true);
  });

  it("stays quiet about a licence with months left", () => {
    const issues = run(plan(), asset({ rightsExpiresAt: new Date("2027-01-01T00:00:00Z") }));
    expect(codes(issues)).not.toContain("rights_expiring");
  });

  it("BLOCKS organic-only footage in ad creative — ad usage is paid usage", () => {
    const issues = run(plan(), asset({ rightsScope: "organic" }));
    expect(blocking(issues).map((i) => i.code)).toContain("rights_organic_only");
  });

  it("blocks an asset not cleared for the network the placement targets", () => {
    const issues = run(plan(), asset({ platformClearance: { meta: false } }));
    const issue = blocking(issues).find((i) => i.code === "not_cleared")!;
    expect(issue.message).toContain("not cleared for meta");
  });

  it("does not block on a network the plan is not targeting", () => {
    const issues = run(plan(), asset({ platformClearance: { tiktok: false } }));
    expect(codes(issues)).not.toContain("not_cleared");
  });
});

describe("preflightPlan — readiness", () => {
  it("blocks an asset still processing", () => {
    expect(blocking(run(plan(), asset({ uploadStatus: "processing" }))).map((i) => i.code)).toContain("asset_not_ready");
  });

  it("blocks infected media outright", () => {
    expect(blocking(run(plan(), asset({ scanStatus: "infected" }))).map((i) => i.code)).toContain("asset_infected");
  });

  it("warns rather than blocks on a scan that has not finished", () => {
    const issues = run(plan(), asset({ scanStatus: "pending" }));
    expect(codes(issues)).toContain("asset_unscanned");
    expect(passes(issues)).toBe(true);
  });

  it("blocks when the image a plan refers to has left the library", () => {
    expect(blocking(run(plan(), null)).map((i) => i.code)).toContain("asset_missing");
  });

  it("warns that a low-resolution source will be enlarged, naming both sizes", () => {
    const issues = run(plan(), asset({ width: 800, height: 1400 }));
    const low = issues.find((i) => i.code === "low_resolution")!;
    expect(low.message).toContain("800×1400");
    expect(low.message).toContain("1080×1920");
  });

  it("checks opening-frame variant images too, not just the base shot", () => {
    const p = plan();
    p.variants = [{ id: "f", kind: "opening_frame", values: ["gone"] }];
    expect(blocking(run(p)).map((i) => i.code)).toContain("asset_missing");
  });
});

describe("preflightPlan — structure", () => {
  it("warns when nothing has been attached yet", () => {
    const p = plan();
    p.shots[0].assetId = undefined;
    expect(codes(run(p, null))).toContain("no_imagery");
  });

  it("names an inert variant instead of letting it render a duplicate", () => {
    const p = plan();
    p.overlays = p.overlays.filter((o) => !(o.kind === "text" && o.role === "cta"));
    p.variants = [{ id: "c", kind: "cta", values: ["Buy"] }];
    const issue = run(p).find((i) => i.code === "inert_variant")!;
    expect(issue.message).toContain("exactly the same as the base");
  });

  it("warns about a logo role the brand kit does not have", () => {
    const p = plan();
    p.overlays.push({ id: "logo-x", kind: "logo", logoRole: "mono_dark", anchor: "top_left", widthFraction: 0.2 });
    expect(codes(run(p))).toContain("logo_not_in_kit");
  });

  it("restates that a placement's numbers are unverified every time they are used", () => {
    const p = plan();
    p.placements = ["tiktok_infeed_9x16"];
    const issue = run(p).find((i) => i.code === "unverified_spec")!;
    expect(issue.message).toContain("Unverified");
  });

  it("says nothing about sources for a placement whose dimensions are published", () => {
    expect(codes(run(plan()))).not.toContain("unverified_spec");
  });
});

describe("preflightRender", () => {
  const spec = () => {
    const p = plan();
    return resolveRenderSpec({ variant: expandVariants(p)[0], placement: "meta_reels_9x16", kit: readBrandKit({}) });
  };

  const result = (over: Partial<RenderResult> = {}): RenderResult => ({
    bytes: Buffer.alloc(0),
    mimeType: "image/png",
    extension: ".png",
    size: { width: 1080, height: 1920 },
    placed: [],
    fonts: [],
    findings: [],
    ...over,
  });

  it("warns — not blocks — when an overlay reaches the Reels chrome, and says why it only warns", () => {
    const s = spec();
    const issues = preflightRender(s, result({ placed: [{ id: s.texts[0].id, anchor: "bottom_center", rect: { x: 100, y: 1800, width: 400, height: 100 } }] }));
    const issue = issues.find((i) => i.code === "safe_zone")!;
    expect(issue.severity).toBe("warning");
    expect(issue.message).toContain("the bottom band");
    expect(issue.message).toContain("not published by Meta in a form we could read");
  });

  it("names the overlay a person will recognise", () => {
    const s = spec();
    const issues = preflightRender(s, result({ placed: [{ id: s.texts[0].id, anchor: "top_center", rect: { x: 100, y: 0, width: 400, height: 100 } }] }));
    expect(issues[0].message).toContain("Half price");
  });

  it("BLOCKS type that has run off the canvas — that is not a matter of taste", () => {
    const s = spec();
    const issues = preflightRender(s, result({ placed: [{ id: s.texts[0].id, anchor: "top_left", rect: { x: 900, y: 100, width: 400, height: 100 } }] }));
    const issue = blocking(issues).find((i) => i.code === "overlay_off_canvas")!;
    expect(issue.message).toContain("55% outside");
  });

  it("reports a substituted font once per family, not once per overlay", () => {
    const s = spec();
    const fonts = [
      { requested: "Inter", used: "sans", substituted: true },
      { requested: "Inter", used: "sans", substituted: true },
      { requested: "", used: "sans", substituted: false },
    ];
    const issues = preflightRender(s, result({ fonts }));
    expect(issues.filter((i) => i.code === "font_substituted")).toHaveLength(1);
    expect(issues[0].message).toContain("“Inter”");
  });

  it("promotes the renderer's own findings, blocking on a base it could not read", () => {
    const issues = preflightRender(spec(), result({ findings: [{ code: "base_missing", detail: "could not read" }] }));
    expect(blocking(issues).map((i) => i.code)).toEqual(["base_missing"]);
  });

  it("treats an upscale as a warning — it is ugly, not invalid", () => {
    const issues = preflightRender(spec(), result({ findings: [{ code: "base_upscaled", detail: "enlarged" }] }));
    expect(issues[0].severity).toBe("warning");
  });

  it("stamps every issue with the placement and variant it came from", () => {
    const s = spec();
    const issues = preflightRender(s, result({ findings: [{ code: "base_upscaled", detail: "x" }] }));
    expect(issues[0]).toMatchObject({ placement: "meta_reels_9x16", variantId: "base" });
  });

  it("is silent on a clean render", () => {
    expect(preflightRender(spec(), result())).toEqual([]);
  });
});
