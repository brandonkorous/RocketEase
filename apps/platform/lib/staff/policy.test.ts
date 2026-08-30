import { describe, expect, it } from "vitest";
import { parseStaffEmails, resolveStaffRole, staffAtLeast } from "./policy";

const verified = (email: string) => ({ email, emailVerified: true });

describe("parseStaffEmails", () => {
  it("reads a comma-separated list, case-insensitively", () => {
    const e = parseStaffEmails("Brandon@Wize.Works, ops@wize.works");
    expect(e.has("brandon@wize.works")).toBe(true);
    expect(e.has("ops@wize.works")).toBe(true);
  });

  it("drops entries that are not addresses", () => {
    expect(parseStaffEmails("wize.works,,  ").size).toBe(0);
  });

  it("is empty when unset", () => {
    expect(parseStaffEmails(undefined).size).toBe(0);
  });
});

describe("resolveStaffRole", () => {
  const emails = parseStaffEmails("brandon@wize.works");

  it("gives nobody a role by default", () => {
    expect(resolveStaffRole(null, new Set(), verified("someone@example.com"))).toBeNull();
  });

  it("grants admin to a bootstrap address", () => {
    expect(resolveStaffRole(null, emails, verified("brandon@wize.works"))).toBe("admin");
  });

  it("matches the bootstrap address whole, never as a substring", () => {
    expect(resolveStaffRole(null, emails, verified("brandon@wize.works.attacker.com"))).toBeNull();
    expect(resolveStaffRole(null, emails, verified("notbrandon@wize.works"))).toBeNull();
  });

  it("ignores case and surrounding whitespace on the candidate", () => {
    expect(resolveStaffRole(null, emails, verified("  Brandon@WIZE.works "))).toBe("admin");
  });

  it("refuses an unverified email on the bootstrap path", () => {
    expect(resolveStaffRole(null, emails, { email: "brandon@wize.works", emailVerified: false })).toBeNull();
  });

  it("lets a stored row win, so a bootstrap address can be demoted without a redeploy", () => {
    expect(resolveStaffRole({ role: "support" }, emails, verified("brandon@wize.works"))).toBe("support");
  });

  it("trusts a stored row even when the email is unverified", () => {
    expect(resolveStaffRole({ role: "admin" }, new Set(), { email: "ops@wize.works", emailVerified: false })).toBe("admin");
  });
});

describe("staffAtLeast", () => {
  it("lets admin do support work but not the reverse", () => {
    expect(staffAtLeast("admin", "support")).toBe(true);
    expect(staffAtLeast("support", "admin")).toBe(false);
  });

  it("satisfies a role against itself", () => {
    expect(staffAtLeast("support", "support")).toBe(true);
    expect(staffAtLeast("admin", "admin")).toBe(true);
  });
});
