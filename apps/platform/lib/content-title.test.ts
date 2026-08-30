import { describe, expect, it } from "vitest";
import { DEFAULT_TITLE, deriveTitle, isAutoTitle } from "./content-title";

describe("deriveTitle", () => {
  it("names a draft after its first line", () => {
    expect(deriveTitle("Filing was never what made a note worth keeping.")).toBe(
      "Filing was never what made a note worth keeping.",
    );
  });

  it("uses only the first non-empty line", () => {
    expect(deriveTitle("\n\n  Where the thought lands.  \nSecond line here.")).toBe("Where the thought lands.");
  });

  it("collapses runs of whitespace", () => {
    expect(deriveTitle("Don't   organize\tit.")).toBe("Don't organize it.");
  });

  it("falls back when there is no text yet", () => {
    expect(deriveTitle("")).toBe(DEFAULT_TITLE);
    expect(deriveTitle("   \n  \n ")).toBe(DEFAULT_TITLE);
  });

  it("truncates a long line on a word boundary", () => {
    const title = deriveTitle(
      "You are sitting at the lake and an idea arrives and you have about four seconds before it goes",
    );
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title).not.toMatch(/\s…$/);
    expect(title.slice(0, -1).split(" ").pop()).not.toBe("");
  });

  it("hard-cuts a single long word rather than returning nothing", () => {
    const title = deriveTitle("x".repeat(120));
    expect(title).toBe(`${"x".repeat(60)}…`);
  });
});

describe("isAutoTitle", () => {
  it("treats the default as ours to replace", () => {
    expect(isAutoTitle(DEFAULT_TITLE, "anything")).toBe(true);
  });

  it("recognises a title it derived from the previous text", () => {
    const text = "Capture now. Use later.";
    expect(isAutoTitle(deriveTitle(text), text)).toBe(true);
  });

  it("leaves a title a person chose alone", () => {
    expect(isAutoTitle("Q3 launch announcement", "Capture now. Use later.")).toBe(false);
  });
});
