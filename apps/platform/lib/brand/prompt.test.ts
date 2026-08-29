import { describe, expect, it } from "vitest";
import { brandHealth, brandWarnings } from "./health";
import { brandImagePrompt, brandKitPrompt } from "./prompt";
import { EMPTY_KIT, readBrandKit } from "./read";
import type { BrandKit } from "./types";

const kit = (patch: Record<string, unknown>): BrandKit => readBrandKit({ brandKit: patch });
const TODAY = "2026-08-28";

describe("brandKitPrompt", () => {
  it("contributes nothing when the kit is empty", () => {
    expect(brandKitPrompt(EMPTY_KIT, { today: TODAY })).toBe("");
  });

  it("never emits the voice — the prompt builder already adds it", () => {
    const p = brandKitPrompt(kit({ voice: { tone: "Dry and factual" } }), { today: TODAY });
    expect(p).not.toContain("Dry and factual");
  });

  it("states identity and approved messaging as usable facts", () => {
    const p = brandKitPrompt(kit({ identity: { displayName: "Ash & Oak", oneLiner: "A two-chair salon in Leeds." }, messaging: { valueProps: ["Curly hair specialists"] } }), { today: TODAY });
    expect(p).toContain("Ash & Oak");
    expect(p).toContain("A two-chair salon in Leeds.");
    expect(p).toContain("Curly hair specialists");
  });

  it("drops an offer that has already expired", () => {
    const p = brandKitPrompt(kit({ messaging: { offers: [{ name: "Summer", detail: "20% off", expiresAt: "2026-08-01" }, { name: "Autumn", detail: "Free fringe trim", expiresAt: "2026-12-01" }] } }), { today: TODAY });
    expect(p).not.toContain("Summer");
    expect(p).toContain("Autumn");
  });

  it("keeps an offer that has no end date", () => {
    const p = brandKitPrompt(kit({ messaging: { offers: [{ name: "Referral", detail: "£10 credit" }] } }), { today: TODAY });
    expect(p).toContain("Referral");
  });

  it("passes banned words and compliance rules through", () => {
    const p = brandKitPrompt(kit({ voiceRules: { bannedWords: ["synergy"] }, rules: { claimRules: ["No medical outcomes"], competitorPolicy: "never" } }), { today: TODAY });
    expect(p).toContain("synergy");
    expect(p).toContain("No medical outcomes");
    expect(p).toContain("Never refer to competitors");
  });
});

describe("brandImagePrompt", () => {
  it("is empty when no visual identity is configured", () => {
    expect(brandImagePrompt(EMPTY_KIT)).toBe("");
  });

  it("carries the palette and forbids drawing the logo", () => {
    const p = brandImagePrompt(kit({ visual: { palette: [{ name: "Ink", hex: "#0a0a0a", role: "primary" }], imagery: { style: "Natural light" } } }));
    expect(p).toContain("#0a0a0a");
    expect(p).toContain("Natural light");
    expect(p).toContain("Do not draw the brand's logo");
  });
});

describe("brand health", () => {
  it("counts an empty kit as nothing done", () => {
    const h = brandHealth(EMPTY_KIT);
    expect(h.done).toBe(0);
    expect(h.percent).toBe(0);
    expect(h.items.every((i) => i.cost.length > 0)).toBe(true);
  });

  it("credits a section as soon as it has something in it", () => {
    const h = brandHealth(kit({ visual: { palette: [{ name: "Ink", hex: "#0a0a0a", role: "primary" }] } }));
    expect(h.items.find((i) => i.label === "Colour palette")?.done).toBe(true);
  });

  it("warns about an offer that has gone stale", () => {
    const w = brandWarnings(kit({ messaging: { offers: [{ name: "Summer", detail: "20% off", expiresAt: "2026-08-01" }] } }), TODAY);
    expect(w.some((x) => x.text.includes("Summer"))).toBe(true);
  });
});
