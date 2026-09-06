import { describe, expect, it } from "vitest";
import { buttonColors, displayUrl, isPublicLink, nextFreeSlug, normalizeUrl, slugFrom } from "./rules";
import type { Swatch } from "@/lib/brand/types";

describe("slugs", () => {
  it("makes a safe lowercase address from any name", () => {
    expect(slugFrom("Piggles")).toBe("piggles");
    expect(slugFrom("  Café Ünlü & Co. ")).toBe("cafe-unlu-co");
    expect(slugFrom("!!!")).toBe("page");
    expect(slugFrom("x")).toBe("x-page");
    expect(slugFrom("a".repeat(60))).toHaveLength(40);
  });

  it("finds the first address nobody holds", () => {
    const taken = new Set(["piggles", "piggles-2"]);
    expect(nextFreeSlug("Piggles", (s) => taken.has(s))).toBe("piggles-3");
    expect(nextFreeSlug("Fresh", (s) => taken.has(s))).toBe("fresh");
  });
});

describe("link addresses", () => {
  it("adds https to a bare host and keeps a full address", () => {
    expect(normalizeUrl("piggles.shop/autumn")).toEqual({ url: "https://piggles.shop/autumn" });
    expect(normalizeUrl("http://example.com/a?b=1")).toEqual({ url: "http://example.com/a?b=1" });
    expect(normalizeUrl("")).toEqual({ url: "" });
  });

  it("refuses anything that is not a web page", () => {
    expect(normalizeUrl("javascript:alert(1)")).toEqual({ error: "Links must start with http:// or https://." });
    expect(normalizeUrl("data:text/html,hi")).toEqual({ error: "Links must start with http:// or https://." });
    expect(normalizeUrl("nodots")).toEqual({ error: "That is not a web address." });
  });

  it("shows the address the way people type it", () => {
    expect(displayUrl("https://piggles.shop/autumn/")).toBe("piggles.shop/autumn");
  });

  it("only shows a link that is on and complete", () => {
    expect(isPublicLink({ enabled: true, title: "Shop", url: "https://a.b" })).toBe(true);
    expect(isPublicLink({ enabled: false, title: "Shop", url: "https://a.b" })).toBe(false);
    expect(isPublicLink({ enabled: true, title: " ", url: "https://a.b" })).toBe(false);
    expect(isPublicLink({ enabled: true, title: "Shop", url: "" })).toBe(false);
  });
});

describe("button colours", () => {
  const palette: Swatch[] = [{ name: "Cream", hex: "#f5f2ea", role: "surface", note: "" }, { name: "Burnt Orange", hex: "#c4472e", role: "primary", note: "" }];

  it("is black by rule, and the brand primary only when asked for and valid", () => {
    expect(buttonColors("black", palette)).toEqual({ background: "#0a0a0a", text: "#ffffff" });
    expect(buttonColors("brand", palette)).toEqual({ background: "#c4472e", text: "#ffffff" });
    expect(buttonColors("brand", [])).toEqual({ background: "#0a0a0a", text: "#ffffff" });
    expect(buttonColors("brand", [{ name: "Bad", hex: "javascript:", role: "primary", note: "" }])).toEqual({ background: "#0a0a0a", text: "#ffffff" });
  });

  it("switches to dark text on a light brand colour", () => {
    expect(buttonColors("brand", [{ name: "Cream", hex: "#f5f2ea", role: "primary", note: "" }])).toEqual({ background: "#f5f2ea", text: "#0a0a0a" });
    expect(buttonColors("brand", [{ name: "Short", hex: "#fff", role: "primary", note: "" }]).background).toBe("#ffffff");
  });
});
