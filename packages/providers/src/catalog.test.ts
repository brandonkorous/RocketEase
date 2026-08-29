import { describe, expect, it } from "vitest";
import { CAPABILITY_CATALOG, CAPABILITY_PATHS, capabilitySupported, reasonFor, type CapabilityPath } from "./catalog";

/** Anything a network cannot do must say why — that promise is what the public page renders. */
const MUST_EXPLAIN: CapabilityPath[] = CAPABILITY_PATHS.filter(
  (p) => p.startsWith("inbox.") || p.startsWith("ads.") || p.startsWith("ingestion."),
);

describe("capability catalog", () => {
  it("covers every channel kind exactly once", () => {
    const kinds = CAPABILITY_CATALOG.map((e) => e.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds.length).toBeGreaterThan(8);
  });

  it.each(CAPABILITY_CATALOG.map((e) => [e.kind, e] as const))("%s explains every unsupported inbox/ads/ingestion capability", (_kind, entry) => {
    const unexplained = MUST_EXPLAIN.filter((p) => !capabilitySupported(entry.capabilities, p) && !reasonFor(entry.capabilities, p));
    expect(unexplained).toEqual([]);
  });

  it.each(CAPABILITY_CATALOG.map((e) => [e.kind, e] as const))("%s explains missing formats, first comment, links and alt text", (_kind, entry) => {
    const paths: CapabilityPath[] = ["formats", "limits.firstComment", "limits.links", "limits.altText"];
    const unexplained = paths.filter((p) => !capabilitySupported(entry.capabilities, p) && !reasonFor(entry.capabilities, p));
    expect(unexplained).toEqual([]);
  });

  it("marks scope-dependent capabilities as conditional with the adapter's reason", () => {
    const x = CAPABILITY_CATALOG.find((e) => e.kind === "x_account");
    expect(x?.capabilities.inbox.messages).toBe(true);
    expect(x?.conditional["inbox.messages"]).toMatch(/dm\.read/);
    const tiktok = CAPABILITY_CATALOG.find((e) => e.kind === "tiktok_account");
    expect(tiktok?.conditional["inbox.comments"]).toMatch(/comment\.list/);
  });

  it("never carries a credential", () => {
    expect(JSON.stringify(CAPABILITY_CATALOG)).not.toMatch(/accessToken|refreshToken/);
  });
});
