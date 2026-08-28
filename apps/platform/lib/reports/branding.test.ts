import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EMPTY_BRANDING, brandingLogoKey, mergeBranding, parseBranding, parseClientBrand } from "./branding-data";

describe("agency branding on organization metadata", () => {
  it("reads what was written and keeps the rest of the metadata", () => {
    const before = JSON.stringify({ onboarding: { done: true } });
    const branding = { agencyName: "Northwind Studio", logoKey: "org/o1/branding/logo-1.png", footerText: "hello@northwind.example", replyTo: "reports@northwind.example", clientBrand: { ws1: true } };
    const after = mergeBranding(before, branding);
    expect(parseBranding(after)).toEqual(branding);
    expect(JSON.parse(after).onboarding).toEqual({ done: true });
  });

  it("treats missing, malformed and hostile metadata as no branding", () => {
    expect(parseBranding(null)).toEqual(EMPTY_BRANDING);
    expect(parseBranding("not json")).toEqual(EMPTY_BRANDING);
    expect(parseBranding(JSON.stringify({ other: 1 }))).toEqual(EMPTY_BRANDING);
    const junk = parseBranding(JSON.stringify({ agencyBranding: { agencyName: 42, logoKey: { evil: true }, clientBrand: { ws1: "yes", ws2: false } } }));
    expect(junk.agencyName).toBe("");
    expect(junk.logoKey).toBeNull();
    expect(junk.clientBrand).toEqual({ ws2: false });
  });

  it("caps the free text that ends up on a client document", () => {
    const long = parseBranding(JSON.stringify({ agencyBranding: { agencyName: "a".repeat(500), footerText: "b".repeat(900), replyTo: "c".repeat(400) } }));
    expect(long.agencyName).toHaveLength(80);
    expect(long.footerText).toHaveLength(300);
    expect(long.replyTo).toHaveLength(160);
  });

  it("scopes a logo key to its organization", () => {
    expect(brandingLogoKey("org-1", ".png")).toMatch(/^org\/org-1\/branding\/logo-\d+\.png$/);
  });

  it("falls back to no client brand when the workspace has none", () => {
    expect(parseClientBrand({})).toEqual({ logoKey: null, displayName: null });
    expect(parseClientBrand({ brand: { logoKey: "k", displayName: "Acme" } })).toEqual({ logoKey: "k", displayName: "Acme" });
    expect(parseClientBrand({ brand: { logoKey: 7 } })).toEqual({ logoKey: null, displayName: null });
  });
});

// Regression: a client component importing one of these must not drag in node:crypto or the database.
describe("client-safe report modules", () => {
  for (const file of ["share-config.ts", "branding-data.ts"]) {
    it(`${file} imports nothing server-only`, () => {
      const src = readFileSync(path.join(__dirname, file), "utf8");
      expect(src).not.toMatch(/from\s+"(node:|@\/db|@\/lib\/storage)/);
    });
  }
});
