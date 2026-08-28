import { describe, expect, it } from "vitest";
import { emailOf, externalIdOf, joinName, requireUserName, scimActive, splitName } from "./resource";
import { ScimError } from "./errors";

describe("SCIM active flag", () => {
  it("defaults to active when the IdP omits it", () => {
    expect(scimActive({})).toBe(true);
    expect(scimActive({ active: null })).toBe(true);
  });

  it("honours the boolean both ways", () => {
    expect(scimActive({ active: false })).toBe(false);
    expect(scimActive({ active: true })).toBe(true);
  });

  it('treats Entra\'s string "False" as a deactivation', () => {
    for (const raw of ["False", "false", "FALSE", " false ", "0"]) {
      expect(scimActive({ active: raw })).toBe(false);
    }
    expect(scimActive({ active: "True" })).toBe(true);
  });

  it("uses the given fallback when absent, so a partial PATCH can't flip it", () => {
    expect(scimActive({}, false)).toBe(false);
  });

  it("rejects a value it cannot read rather than guessing active", () => {
    expect(() => scimActive({ active: 1 })).toThrow(ScimError);
    expect(() => scimActive({ active: "maybe" })).toThrow(ScimError);
  });
});

describe("SCIM user payload", () => {
  it("requires a userName and lower-cases it", () => {
    expect(requireUserName({ userName: "  Ada@Acme.COM " })).toBe("ada@acme.com");
    expect(() => requireUserName({})).toThrow(ScimError);
    expect(() => requireUserName({ userName: "   " })).toThrow(ScimError);
  });

  it("prefers the primary email and falls back to the userName", () => {
    const emails = [{ value: "alt@acme.com" }, { value: "Ada@Acme.com", primary: true }];
    expect(emailOf({ emails }, "x@acme.com")).toBe("ada@acme.com");
    expect(emailOf({ emails: [{ value: "first@acme.com" }] }, "x@acme.com")).toBe("first@acme.com");
    expect(emailOf({}, "X@Acme.com")).toBe("x@acme.com");
  });

  it("builds one display name from whichever name fields arrived", () => {
    expect(joinName({ name: { formatted: "Ada Lovelace" } })).toBe("Ada Lovelace");
    expect(joinName({ name: { givenName: "Ada", familyName: "Lovelace" } })).toBe("Ada Lovelace");
    expect(joinName({ displayName: "Ada L" })).toBe("Ada L");
    expect(joinName({ userName: "ada@acme.com" })).toBe("ada@acme.com");
  });

  it("splits a display name back into the parts SCIM expects", () => {
    expect(splitName("Ada Lovelace King")).toEqual({ givenName: "Ada", familyName: "Lovelace King" });
    expect(splitName("Ada")).toEqual({ givenName: "Ada", familyName: "" });
    expect(splitName("  ")).toEqual({ givenName: "", familyName: "" });
  });

  it("keeps externalId only when it carries something", () => {
    expect(externalIdOf({ externalId: " ext-1 " })).toBe("ext-1");
    expect(externalIdOf({ externalId: "  " })).toBeNull();
    expect(externalIdOf({})).toBeNull();
  });
});
