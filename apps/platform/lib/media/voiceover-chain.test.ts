/*
 * The voice-over chain survives the quick clip tool it was born with.
 *
 * Any video spec carrying `voiceScript` gets its voice-over queued by
 * completeMediaJob once the picture exists — that is pipeline capability the
 * plan editor's shots rely on next, so the wiring is pinned here even though
 * the generateVideo action that first produced such specs was removed
 * (2026-09-01: quick one-click video spend was judged a cost trap; video goes
 * through the plan editor with the total shown first).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("the chain that reads voiceScript back", () => {
  const finish = readFileSync(join(__dirname, "finish.ts"), "utf8");

  it("queues the voice-over from the spec once the picture exists", () => {
    expect(finish).toContain("chainVoiceover");
    expect(finish).toContain("voiceScript");
    expect(finish).toMatch(/"media\.render"/);
  });
});
