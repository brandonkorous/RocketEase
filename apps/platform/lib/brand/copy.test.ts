import { describe, expect, it } from "vitest";
import { COPYABLE, copyPatch, copySummary } from "./copy";
import { EMPTY_KIT } from "./read";
import type { BrandKit, Logo } from "./types";

const source: BrandKit = {
  ...EMPTY_KIT,
  identity: { ...EMPTY_KIT.identity, displayName: "Northwind" },
  voice: { ...EMPTY_KIT.voice, tone: "Warm" },
  voiceRules: { ...EMPTY_KIT.voiceRules, bannedWords: ["synergy"] },
  visual: { ...EMPTY_KIT.visual, clearSpace: "1x", logos: [{ role: "primary", key: "ws/src/brand/logo-primary.png", mimeType: "image/png", bytes: 10, note: "" }] },
  assets: { assetIds: ["src-asset"], links: [{ label: "Drive", url: "https://example.com/drive" }] },
};
const target: BrandKit = { ...EMPTY_KIT, assets: { assetIds: ["own-asset"], links: [] } };
const copied: Logo[] = [{ role: "primary", key: "ws/dst/brand/logo-primary.png", mimeType: "image/png", bytes: 10, note: "" }];

describe("copyPatch", () => {
  it("splits voice into its two stored keys", () => {
    expect(copyPatch(source, target, ["voice"], [])).toEqual({ voice: source.voice, voiceRules: source.voiceRules });
  });

  it("uses the target-side logo copies, never the source keys", () => {
    const p = copyPatch(source, target, ["visual"], copied) as { visual: BrandKit["visual"] };
    expect(p.visual.logos).toEqual(copied);
    expect(p.visual.clearSpace).toBe("1x");
  });

  it("keeps the target's library assets and takes only the source's external links", () => {
    expect(copyPatch(source, target, ["assets"], [])).toEqual({ assets: { assetIds: ["own-asset"], links: source.assets.links } });
  });

  it("copies the plain sections by name and ignores repeats", () => {
    const p = copyPatch(source, target, ["identity", "identity", "rules"], []);
    expect(Object.keys(p)).toEqual(["identity", "rules"]);
    expect(p.identity).toEqual(source.identity);
    expect(COPYABLE).toHaveLength(8);
    expect(copySummary(["visual", "visual"], copied)).toEqual({ sections: ["visual"], logos: 1 });
  });
});
