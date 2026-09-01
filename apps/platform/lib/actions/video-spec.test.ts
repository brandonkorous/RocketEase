/*
 * What actually reaches media_job.spec.
 *
 * Every optional feature on the clip panel is carried by ONE object literal in
 * generateVideo, and TypeScript cannot check it: the fields ride in on a
 * conditional spread, which is exempt from excess-property checking. So an edit
 * that silently fails to apply still compiles, still deploys, and produces a
 * clip with no product frame and no voice — exactly what shipped on 2026-09-01.
 *
 * Asserting the source is blunt, but the alternative was a feature whose only
 * verification was spending $0.80 and watching.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "video.ts"), "utf8");
/** Just the object literal handed to createMediaJob. */
const specBlock = source.slice(source.indexOf("spec: {"), source.indexOf("if (\"error\" in res)"));

describe("the spec generateVideo actually builds", () => {
  it("carries the product reference, or the packshot never reaches the vendor", () => {
    expect(specBlock).toContain("references:");
    expect(specBlock).toContain("productAssetId");
    expect(specBlock).toContain('role: "product"');
  });

  it("carries the voice script, or nothing ever queues the voice-over", () => {
    expect(specBlock).toContain("voiceScript");
    expect(specBlock).toContain("captions");
  });

  it("keeps both OPTIONAL — a clip with neither must not carry empty keys", () => {
    expect(specBlock).toMatch(/\.\.\.\(productAssetId \?/);
    expect(specBlock).toMatch(/\.\.\.\(voiceScript \?/);
  });
});

describe("the chain that reads it back", () => {
  const finish = readFileSync(join(__dirname, "../media/finish.ts"), "utf8");

  it("queues the voice-over from the spec once the picture exists", () => {
    expect(finish).toContain("chainVoiceover");
    expect(finish).toContain("voiceScript");
    expect(finish).toMatch(/"media\.render"/);
  });
});
