import { describe, expect, it } from "vitest";
import type { Capabilities } from "@rocketease/providers";
import { SYNTHETIC_CHOICES, disclosureGap, previewFor, previewLine, readRequireAiDisclosure, toDisclosureInput, undeclaredSyntheticGap } from "./disclosure";
import type { SyntheticMedia } from "@/db/schema/content";

const caps = (disclosure: Capabilities["disclosure"], reason?: string) =>
  ({ disclosure, reasons: reason ? { disclosure: reason } : undefined }) as Pick<Capabilities, "disclosure" | "reasons">;

const sm = (flag: SyntheticMedia["flag"]): SyntheticMedia => ({ flag, setBy: "u1", setAt: "2026-08-28T00:00:00.000Z" });

describe("toDisclosureInput", () => {
  it("maps the three author answers", () => {
    expect(toDisclosureInput(sm("none"))).toEqual({ synthetic: false, assisted: false });
    expect(toDisclosureInput(sm("assisted"))).toEqual({ synthetic: false, assisted: true });
    expect(toDisclosureInput(sm("synthetic_media"))).toEqual({ synthetic: true, assisted: true });
  });
  it("treats a never-answered item as none", () => {
    expect(toDisclosureInput(null)).toEqual({ synthetic: false, assisted: false });
  });
  it("offers exactly the three documented choices", () => {
    expect(SYNTHETIC_CHOICES.map((c) => c.flag)).toEqual(["none", "assisted", "synthetic_media"]);
  });
});

describe("previewFor", () => {
  it("labels synthetic media by the channel's route", () => {
    expect(previewFor(caps("api"), sm("synthetic_media")).method).toBe("api_field");
    expect(previewFor(caps("caption"), sm("synthetic_media")).method).toBe("caption_text");
    expect(previewFor(caps("none"), sm("synthetic_media")).method).toBe("none");
  });
  it("emits nothing for AI-assisted text", () => {
    expect(previewFor(caps("caption"), sm("assisted")).method).toBe("none");
  });
  it("reads a channel with no declared route as caption", () => {
    expect(previewFor(caps(undefined), sm("synthetic_media")).method).toBe("caption_text");
  });
});

describe("previewLine", () => {
  it("reads as the composer shows it", () => {
    expect(previewLine("TikTok", "api_field")).toBe("TikTok: labelled via API");
    expect(previewLine("Instagram", "caption_text")).toBe("Instagram: label added to caption");
    expect(previewLine("Demo network", "none")).toBe("Demo network: no label sent");
  });
});

describe("disclosureGap", () => {
  const on = { required: true, channelName: "Studio Reel" };
  const off = { required: false, channelName: "Studio Reel" };

  it("says nothing when the channel can label it", () => {
    expect(disclosureGap(caps("api"), sm("synthetic_media"), on)).toBeNull();
    expect(disclosureGap(caps("caption"), sm("synthetic_media"), on)).toBeNull();
  });

  it("says nothing when no synthetic media was declared", () => {
    expect(disclosureGap(caps("none"), sm("assisted"), on)).toBeNull();
    expect(disclosureGap(caps("none"), null, on)).toBeNull();
  });

  it("blocks when the workspace requires disclosure", () => {
    const g = disclosureGap(caps("none", "No caption on this surface."), sm("synthetic_media"), on)!;
    expect(g.severity).toBe("error");
    expect(g.code).toBe("ai_disclosure_unavailable");
    expect(g.message).toContain("Studio Reel");
    expect(g.message).toContain("No caption on this surface.");
  });

  it("warns instead when it does not", () => {
    expect(disclosureGap(caps("none"), sm("synthetic_media"), off)!.severity).toBe("warning");
  });
});

describe("readRequireAiDisclosure", () => {
  it("is off unless explicitly true", () => {
    expect(readRequireAiDisclosure({})).toBe(false);
    expect(readRequireAiDisclosure({ requireAiDisclosure: "yes" })).toBe(false);
    expect(readRequireAiDisclosure({ requireAiDisclosure: true })).toBe(true);
  });
});

describe("undeclaredSyntheticGap", () => {
  it("warns when a generated file is attached and nothing was declared", () => {
    const g = undeclaredSyntheticGap(["ai.png"], sm("none"), { required: false });
    expect(g).toMatchObject({ severity: "warning", code: "synthetic_undeclared" });
    expect(g?.message).toContain("“ai.png”");
    expect(g?.message).toContain("Contains AI-generated media?");
  });

  it("blocks instead of warning when the workspace requires disclosure", () => {
    expect(undeclaredSyntheticGap(["ai.png"], sm("none"), { required: true })).toMatchObject({ severity: "error" });
  });

  it("treats an unanswered item the same as an explicit no", () => {
    expect(undeclaredSyntheticGap(["ai.png"], null, { required: false })?.code).toBe("synthetic_undeclared");
  });

  it("is not satisfied by 'AI-assisted text only' — the media is still synthetic", () => {
    expect(undeclaredSyntheticGap(["ai.png"], sm("assisted"), { required: false })?.code).toBe("synthetic_undeclared");
  });

  it("says nothing once synthetic media is declared", () => {
    expect(undeclaredSyntheticGap(["ai.png"], sm("synthetic_media"), { required: false })).toBeNull();
  });

  it("says nothing when no attached file was generated", () => {
    expect(undeclaredSyntheticGap([], sm("none"), { required: true })).toBeNull();
  });

  it("names every generated file, and agrees with itself", () => {
    const g = undeclaredSyntheticGap(["a.png", "b.png"], sm("none"), { required: false });
    expect(g?.message).toContain("“a.png”, “b.png”");
    expect(g?.message).toContain("were generated");
  });
});
