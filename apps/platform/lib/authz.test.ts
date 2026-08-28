import { describe, expect, it } from "vitest";
import { CAPABILITIES, can, capabilitiesOf, decide, grantableFor } from "./authz";
import { WORKSPACE_ROLES } from "@/db/schema/app";

describe("authorization matrix", () => {
  it("owner can do everything outright except policy/assigned cells", () => {
    for (const cap of CAPABILITIES) expect(decide({ role: "owner", grants: [] }, cap)).toBe("allow");
  });

  it("viewer is read-only", () => {
    const p = { role: "viewer", grants: [] } as const;
    expect(can(p, "analytics.view")).toBe(true);
    expect(can(p, "content.create")).toBe(false);
    expect(can(p, "content.publish")).toBe(false);
    expect(can(p, "channels.manage")).toBe(false);
  });

  it("grants only add grantable capabilities — deny still wins", () => {
    const manager = { role: "manager", grants: ["audit.view", "org.delete"] } as const;
    expect(can(manager, "audit.view")).toBe(true);
    expect(can(manager, "org.delete")).toBe(false); // "no" cell can't be granted
    expect(grantableFor("manager")).toContain("channels.manage");
    expect(grantableFor("manager")).not.toContain("org.billing");
  });

  it("creator publish is policy-gated", () => {
    const creator = { role: "creator", grants: [] } as const;
    expect(decide(creator, "content.publish")).toBe("policy");
    expect(can(creator, "content.publish")).toBe(false);
    expect(can(creator, "content.publish", { policyAllows: true })).toBe(true);
  });

  it("client approver decides only when assigned and can comment", () => {
    const ca = { role: "client_approver", grants: [] } as const;
    expect(decide(ca, "approvals.decide")).toBe("assigned");
    expect(can(ca, "approvals.decide")).toBe(false);
    expect(can(ca, "approvals.decide", { isAssigned: true })).toBe(true);
    expect(can(ca, "content.comment")).toBe(true);
    expect(can(ca, "content.edit")).toBe(false);
  });

  it("every role resolves every capability without throwing", () => {
    for (const role of WORKSPACE_ROLES) {
      const caps = capabilitiesOf({ role, grants: [] });
      expect(Array.isArray(caps)).toBe(true);
    }
  });
});
