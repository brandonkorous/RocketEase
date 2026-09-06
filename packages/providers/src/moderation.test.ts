import { describe, expect, it } from "vitest";
import { CAPABILITY_CATALOG, capabilitySupported, reasonFor } from "./catalog";
import { createProviderRegistry } from "./index";
import { HIDE_SUPPORT, hideWhy } from "./moderation";

const cfg = { clientId: "id", clientSecret: "secret" };

describe("HIDE_SUPPORT", () => {
  it("cites a document for every network that can hide, and a reason for every one that cannot", () => {
    for (const [network, s] of Object.entries(HIDE_SUPPORT)) {
      if (s.hide) expect(s.doc, network).toMatch(/^https?:\/\/|\.ts$/);
      else expect(s.why, network).toMatch(/\w+\.$/);
    }
    expect(hideWhy("facebook")).toBeUndefined();
    expect(hideWhy("linkedin")).toMatch(/LinkedIn/);
  });

  it("agrees with what every adapter declares and implements", () => {
    const registry = createProviderRegistry({ enableMock: true, meta: cfg, linkedin: cfg, tiktok: cfg, youtube: cfg, pinterest: cfg, x: cfg, google_business: cfg, threads: cfg, bluesky: cfg });
    for (const entry of CAPABILITY_CATALOG) {
      const support = HIDE_SUPPORT[entry.network];
      const adapter = registry.get(entry.provider);
      const declared = capabilitySupported(entry.capabilities, "inbox.hide");
      // A network that can hide has the adapter method; one that cannot declares false with the table's reason.
      if (support.hide) {
        expect(adapter?.hideItem, entry.kind).toBeTypeOf("function");
        if (entry.capabilities.inbox.comments) expect(declared, entry.kind).toBe(true);
      } else {
        expect(declared, entry.kind).toBe(false);
        expect(adapter?.hideItem, entry.kind).toBeUndefined();
        expect(reasonFor(entry.capabilities, "inbox.hide"), entry.kind).toBe(support.why);
      }
    }
  });
});
