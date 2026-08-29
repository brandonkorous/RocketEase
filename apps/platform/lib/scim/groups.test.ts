import { describe, expect, it } from "vitest";
import { groupDisplayName, groupIdFor, groupsForWorkspaces, parseGroupName } from "./groups";
import { WORKSPACE_ROLES } from "@/db/schema/app";

describe("group ↔ workspace role mapping", () => {
  it("round-trips every role preset", () => {
    for (const role of WORKSPACE_ROLES) {
      expect(parseGroupName(groupDisplayName("acme", role))).toEqual({ workspaceSlug: "acme", role });
    }
  });

  it("accepts the underscored preset names", () => {
    expect(parseGroupName("rke:acme:client_approver")).toEqual({ workspaceSlug: "acme", role: "client_approver" });
  });

  it("is case-insensitive and trims", () => {
    expect(parseGroupName("  RKE:Acme:ADMIN ")).toEqual({ workspaceSlug: "acme", role: "admin" });
  });

  it("ignores groups that are not ours", () => {
    for (const name of ["Engineering", "okta:acme:admin", "rke:acme", "rke:acme:admin:extra", ""]) {
      expect(parseGroupName(name)).toBeNull();
    }
  });

  it("rejects an unknown role rather than defaulting to one", () => {
    expect(parseGroupName("rke:acme:superuser")).toBeNull();
    expect(parseGroupName("rke:acme:Owner ")).toEqual({ workspaceSlug: "acme", role: "owner" });
  });

  it("rejects a slug with illegal characters", () => {
    expect(parseGroupName("rke:acme corp:admin")).toBeNull();
    expect(parseGroupName("rke:-acme:admin")).toBeNull();
  });

  it("uses the display name as the id", () => {
    expect(groupIdFor("RKE:Acme:Admin")).toBe("rke:acme:admin");
  });

  it("lists one group per workspace per role", () => {
    const all = groupsForWorkspaces(["acme", "globex"]);
    expect(all).toHaveLength(WORKSPACE_ROLES.length * 2);
    expect(all).toContain("rke:globex:responder");
    expect(new Set(all).size).toBe(all.length);
  });
});
