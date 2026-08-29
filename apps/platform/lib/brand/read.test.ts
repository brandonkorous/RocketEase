import { describe, expect, it } from "vitest";
import { EMPTY_KIT, readBrandKit } from "./read";

describe("readBrandKit", () => {
  it("returns an empty kit for a workspace that has never set one", () => {
    expect(readBrandKit({})).toEqual(EMPTY_KIT);
  });

  it("still reads a voice written before the kit existed", () => {
    const kit = readBrandKit({ brandVoice: { tone: "Dry", doList: ["Be short"] } });
    expect(kit.voice.tone).toBe("Dry");
    expect(kit.voice.doList).toEqual(["Be short"]);
  });

  it("prefers the kit's voice over the legacy key", () => {
    const kit = readBrandKit({ brandVoice: { tone: "Old" }, brandKit: { voice: { tone: "New" } } });
    expect(kit.voice.tone).toBe("New");
  });

  it("drops a swatch that is not a hex colour rather than rendering it", () => {
    const kit = readBrandKit({ brandKit: { visual: { palette: [{ hex: "#0a0a0a", name: "Ink" }, { hex: "javascript:alert(1)" }, { hex: "rebeccapurple" }] } } });
    expect(kit.visual.palette.map((s) => s.hex)).toEqual(["#0a0a0a"]);
  });

  it("survives a hand-edited blob of the wrong shape", () => {
    const kit = readBrandKit({ brandKit: { identity: "nope", audiences: { name: "x" }, messaging: { offers: "none" }, rules: 7 } });
    expect(kit.identity.displayName).toBe("");
    expect(kit.audiences).toEqual([]);
    expect(kit.messaging.offers).toEqual([]);
    expect(kit.rules.claimRules).toEqual([]);
  });

  it("clamps list lengths and drops blank entries", () => {
    const kit = readBrandKit({ brandKit: { identity: { locations: ["Leeds", "", "  ", ...Array.from({ length: 20 }, (_, i) => `x${i}`)] } } });
    expect(kit.identity.locations.length).toBe(12);
    expect(kit.identity.locations[0]).toBe("Leeds");
  });

  it("keeps a link only when it has a URL", () => {
    const kit = readBrandKit({ brandKit: { identity: { links: [{ label: "Book", url: "https://x.test" }, { label: "Orphan" }] } } });
    expect(kit.identity.links).toEqual([{ label: "Book", url: "https://x.test" }]);
  });

  it("ignores a logo with no storage key", () => {
    const kit = readBrandKit({ brandKit: { visual: { logos: [{ role: "primary", key: "ws/1/brand/logo-primary.png" }, { role: "mark" }, { role: "invented", key: "k" }] } } });
    expect(kit.visual.logos.map((l) => l.role)).toEqual(["primary"]);
  });
});
