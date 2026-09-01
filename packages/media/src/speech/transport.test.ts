/*
 * The file part whisper is handed.
 */
import { describe, expect, it } from "vitest";
import { extensionFor } from "./transport";

describe("extensionFor", () => {
  it("names an mp3 as .mp3 — whisper sniffs the EXTENSION, not the Content-Type", () => {
    // A part called "audio" with no suffix is a 400, whatever the type header
    // says. Verified against the live deployment (docs/bugs/B-015).
    expect(extensionFor("audio/mpeg")).toBe(".mp3");
  });

  it("handles the containers a generated or uploaded asset actually arrives in", () => {
    expect(extensionFor("audio/wav")).toBe(".wav");
    expect(extensionFor("audio/mp4")).toBe(".m4a");
    expect(extensionFor("video/mp4")).toBe(".mp4");
  });

  it("ignores charset noise on the mime type rather than falling through", () => {
    expect(extensionFor("audio/mpeg; charset=binary")).toBe(".mp3");
    expect(extensionFor("AUDIO/MPEG")).toBe(".mp3");
  });

  it("always returns SOME extension — an unknown type must not become a 400", () => {
    expect(extensionFor("application/octet-stream")).toBe(".mp3");
    expect(extensionFor("")).toBe(".mp3");
  });
});
