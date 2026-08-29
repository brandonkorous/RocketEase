import { describe, expect, it } from "vitest";
import { DISCLOSURE_LINE, applyDisclosure, disclosureRequired, disclosureSupport, planDisclosure, withDisclosureLine } from "./disclosure";
import { CAPABILITY_CATALOG, capabilitySupported } from "./catalog";
import { videoBody } from "./youtube/publish";
import type { Capabilities, ChannelDescriptor, DisclosureSupport, PublishRequest } from "./index";

const caps = (disclosure: DisclosureSupport, reason?: string): Capabilities => ({
  formats: ["video"],
  scheduling: "internal",
  limits: {},
  inbox: { comments: false, mentions: false, messages: false, reviews: false, reply: false },
  insights: { organic: false, audience: false },
  ads: { import: false, manage: false },
  ingestion: { webhooks: false, polling: false },
  disclosure,
  reasons: reason ? { disclosure: reason } : undefined,
  checkedAt: "2026-08-28T00:00:00.000Z",
});

const channel = (c: Capabilities) => ({ capabilities: c }) as Pick<ChannelDescriptor, "capabilities">;
const req = (over: Partial<PublishRequest> = {}): PublishRequest => ({ idempotencyKey: "k", format: "video", text: "Hello", media: [], ...over });

describe("disclosureRequired", () => {
  it("triggers on synthetic media only", () => {
    expect(disclosureRequired({ synthetic: true, assisted: false })).toBe(true);
    expect(disclosureRequired({ synthetic: false, assisted: true })).toBe(false);
    expect(disclosureRequired(undefined)).toBe(false);
  });
});

describe("planDisclosure", () => {
  const synth = { synthetic: true, assisted: true };
  it("maps each support level", () => {
    expect(planDisclosure("api", synth).method).toBe("api_field");
    expect(planDisclosure("caption", synth).method).toBe("caption_text");
    expect(planDisclosure("none", synth).method).toBe("none");
  });
  it("carries the channel's own reason when nothing can be emitted", () => {
    expect(planDisclosure("none", synth, "No field here.").detail).toBe("No field here.");
  });
  it("emits nothing for assisted text, and says why", () => {
    const p = planDisclosure("caption", { synthetic: false, assisted: true });
    expect(p.method).toBe("none");
    expect(p.detail).toMatch(/assisted/i);
  });
});

describe("applyDisclosure", () => {
  it("leaves text alone on api channels", () => {
    const r = applyDisclosure(channel(caps("api")), req({ disclosure: { synthetic: true, assisted: false } }));
    expect(r.request.text).toBe("Hello");
    expect(r.emitted.method).toBe("api_field");
  });

  it("appends one line on caption channels", () => {
    const r = applyDisclosure(channel(caps("caption")), req({ disclosure: { synthetic: true, assisted: false } }));
    expect(r.request.text).toBe(`Hello\n\n${DISCLOSURE_LINE}`);
    expect(r.emitted.method).toBe("caption_text");
  });

  it("never stacks the line across retries", () => {
    expect(withDisclosureLine(withDisclosureLine("Hello"))).toBe(`Hello\n\n${DISCLOSURE_LINE}`);
  });

  it("changes nothing when no synthetic media is declared", () => {
    const r = applyDisclosure(channel(caps("caption")), req({ disclosure: { synthetic: false, assisted: true } }));
    expect(r.request.text).toBe("Hello");
    expect(r.emitted.method).toBe("none");
  });

  it("reports the channel's reason when the network offers no route", () => {
    const r = applyDisclosure(channel(caps("none", "Stories carry no caption.")), req({ disclosure: { synthetic: true, assisted: false } }));
    expect(r.emitted).toEqual({ method: "none", detail: "Stories carry no caption." });
  });

  it("defaults a channel whose stored capabilities predate the field to caption", () => {
    const legacy = { ...caps("caption") };
    delete legacy.disclosure;
    expect(disclosureSupport(channel(legacy))).toBe("caption");
  });
});

describe("network mapping", () => {
  it("YouTube sets status.containsSyntheticMedia only when declared", () => {
    const on = videoBody(req({ disclosure: { synthetic: true, assisted: false } })).status as Record<string, unknown>;
    const off = videoBody(req()).status as Record<string, unknown>;
    expect(on.containsSyntheticMedia).toBe(true);
    expect("containsSyntheticMedia" in off).toBe(false);
  });

  it("declares a disclosure route for every catalog entry that publishes", () => {
    // A channel that publishes nothing (Google Business Profile locations) has nothing to disclose.
    for (const e of CAPABILITY_CATALOG.filter((x) => x.capabilities.formats.length > 0)) expect(capabilitySupported(e.capabilities, "disclosure"), e.label).toBe(true);
    for (const e of CAPABILITY_CATALOG.filter((x) => x.capabilities.formats.length === 0)) expect(e.capabilities.reasons?.disclosure, e.label).toBeTruthy();
  });

  it("puts TikTok, YouTube and Instagram on the API path and the rest on captions", () => {
    const by = (kind: string) => CAPABILITY_CATALOG.find((e) => e.kind === kind)!.capabilities.disclosure;
    expect(by("tiktok_account")).toBe("api");
    expect(by("youtube_channel")).toBe("api");
    expect(by("instagram_business")).toBe("api");
    expect(by("facebook_page")).toBe("caption");
    expect(by("linkedin_organization")).toBe("caption");
    expect(by("x_account")).toBe("caption");
    expect(by("pinterest_board")).toBe("caption");
  });
});
