import { describe, expect, it } from "vitest";
import { CAPABILITY_CATALOG, capabilitySupported, reasonFor } from "./catalog";
import { MESSAGING_RULES, dmWhy } from "./messaging";

describe("MESSAGING_RULES", () => {
  it("cites a document for every network with DMs, and a reason for every one without", () => {
    for (const [network, r] of Object.entries(MESSAGING_RULES)) {
      if (r.dm) {
        expect(r.doc, network).toMatch(/^https?:\/\/|\.ts$/);
        expect(r.windowHours === null || r.windowHours > 0, network).toBe(true);
      } else expect(r.why, network).toMatch(/\w+\.$/);
    }
    expect(dmWhy("instagram")).toBeUndefined();
    expect(dmWhy("threads")).toMatch(/Threads/);
  });

  it("agrees with what every adapter declares about direct messages", () => {
    for (const entry of CAPABILITY_CATALOG) {
      const r = MESSAGING_RULES[entry.network];
      const declared = capabilitySupported(entry.capabilities, "inbox.messages");
      // A network without a DM API never declares messages, and the table repeats one of its adapter's reasons word for word.
      if (r.dm) continue;
      expect(declared, entry.kind).toBe(false);
      const reasons = CAPABILITY_CATALOG.filter((e) => e.network === entry.network).map((e) => reasonFor(e.capabilities, "inbox.messages"));
      expect(reasons, entry.kind).toContain(r.why);
    }
    // Every network that reads DMs (with full scopes) is in the table as one that can.
    for (const entry of CAPABILITY_CATALOG) if (capabilitySupported(entry.capabilities, "inbox.messages")) expect(MESSAGING_RULES[entry.network].dm, entry.kind).toBe(true);
  });

  it("holds Meta's 24-hour window and 7-day person window, and X's published send caps", () => {
    expect(MESSAGING_RULES.instagram).toMatchObject({ windowHours: 24, personWindow: { days: 7 } });
    expect(MESSAGING_RULES.facebook).toMatchObject({ windowHours: 24, personWindow: { days: 7 } });
    expect(MESSAGING_RULES.x).toMatchObject({ windowHours: null, caps: { per15min: 15, per24h: 1440 } });
  });
});
