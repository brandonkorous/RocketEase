import { describe, expect, it } from "vitest";
import { organizationDecision, signupDecision } from "./policy";

describe("self-hosted single-organization rules", () => {
  it("lets the first person claim the install, then admits only invited addresses", () => {
    expect(signupDecision({ selfHosted: true, claimedBy: null, invited: false })).toEqual({ allowed: true });
    expect(signupDecision({ selfHosted: true, claimedBy: "Northwind Agency", invited: true })).toEqual({ allowed: true });
    expect(signupDecision({ selfHosted: true, claimedBy: "Northwind Agency", invited: false })).toEqual({ allowed: false, message: "This install belongs to Northwind Agency. Ask one of its owners to invite you." });
  });

  it("never applies to the cloud", () => {
    expect(signupDecision({ selfHosted: false, claimedBy: "Anyone", invited: false })).toEqual({ allowed: true });
    expect(organizationDecision({ selfHosted: false, claimedBy: "Anyone" })).toEqual({ allowed: true });
  });

  it("refuses a second organization once the install is claimed", () => {
    expect(organizationDecision({ selfHosted: true, claimedBy: null })).toEqual({ allowed: true });
    expect(organizationDecision({ selfHosted: true, claimedBy: "Northwind Agency" }).allowed).toBe(false);
  });
});
