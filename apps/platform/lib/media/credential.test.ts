import { describe, expect, it } from "vitest";
import type { AssetProvenance } from "@/db/schema/assets";
import { credentialIssue, credentialIssues } from "./credential";

const prov = (c2pa: AssetProvenance["c2pa"]): AssetProvenance => ({ c2pa, watermark: null, chain: [] });
const subject = (over: Partial<Parameters<typeof credentialIssue>[0]> = {}) => ({
  fileName: "hero.mp4",
  generatedByAi: true,
  provenance: prov("absent"),
  ...over,
});

describe("credentialIssue", () => {
  it("says nothing about a file that still carries its credential", () => {
    expect(credentialIssue(subject({ provenance: prov("signed") }))).toBeNull();
  });

  it("says nothing about an ordinary photo that never had one", () => {
    expect(credentialIssue(subject({ generatedByAi: false }))).toBeNull();
  });

  it("reports an AI file with no credential, and why it matters", () => {
    const i = credentialIssue(subject());
    expect(i?.code).toBe("credential_absent");
    expect(i?.message).toContain("auto-label");
  });

  it("words a credential WE removed as something that happened", () => {
    const i = credentialIssue(subject({ provenance: prov("stripped") }));
    expect(i?.code).toBe("credential_stripped");
    expect(i?.message).toContain("lost it when we re-encoded");
  });

  it("reports a stripped credential on a REAL photo too — cameras sign as well", () => {
    expect(credentialIssue(subject({ generatedByAi: false, provenance: prov("stripped") }))?.code).toBe("credential_stripped");
  });

  it("warns, never blocks — the caption label is a real disclosure", () => {
    expect(credentialIssues([subject(), subject({ provenance: prov("stripped") })]).every((i) => i.severity === "warning")).toBe(true);
  });

  it("is silent for a set with nothing to say", () => {
    expect(credentialIssues([subject({ provenance: prov("signed") }), subject({ generatedByAi: false })])).toEqual([]);
  });
});
