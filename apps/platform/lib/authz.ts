/*
 * Authorization from docs/originals/permissions.md.
 *
 * Roles are presets; "If granted" cells become explicit grants stored on the
 * membership. Deny wins over allow: a grant can only add a capability the role
 * lists as grantable, never override a "No".
 *
 * Client-side hiding is never authorization — call `requireCapability` in
 * every server action / route handler that mutates or reads scoped data.
 */
import type { WorkspaceRole } from "@/db/schema/app";

export const CAPABILITIES = [
  "org.billing",
  "org.delete",
  "workspace.settings",
  "workspace.members",
  "channels.manage",
  "content.create",
  "content.edit",
  "content.comment",
  "content.publish",
  "approvals.decide",
  "conversations.handle",
  "campaigns.manage",
  "campaigns.draft",
  "campaigns.analyze",
  "analytics.view",
  "analytics.view_scoped",
  "reports.export",
  "audit.view",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Yes = always; grant = only when the membership carries the grant; policy = decided by workspace policy at runtime. */
type Cell = "yes" | "grant" | "policy" | "assigned" | "no";

const MATRIX: Record<Capability, Record<WorkspaceRole, Cell>> = {
  "org.billing":          { owner: "yes", admin: "no",  manager: "no",    creator: "no",     responder: "no",    analyst: "no",  client_approver: "no",       viewer: "no" },
  "org.delete":           { owner: "yes", admin: "no",  manager: "no",    creator: "no",     responder: "no",    analyst: "no",  client_approver: "no",       viewer: "no" },
  "workspace.settings":   { owner: "yes", admin: "yes", manager: "grant", creator: "no",     responder: "no",    analyst: "no",  client_approver: "no",       viewer: "no" },
  "workspace.members":    { owner: "yes", admin: "yes", manager: "grant", creator: "no",     responder: "no",    analyst: "no",  client_approver: "no",       viewer: "no" },
  "channels.manage":      { owner: "yes", admin: "yes", manager: "grant", creator: "no",     responder: "no",    analyst: "no",  client_approver: "no",       viewer: "no" },
  "content.create":       { owner: "yes", admin: "yes", manager: "yes",   creator: "yes",    responder: "no",    analyst: "no",  client_approver: "no",       viewer: "no" },
  "content.edit":         { owner: "yes", admin: "yes", manager: "yes",   creator: "yes",    responder: "no",    analyst: "no",  client_approver: "no",       viewer: "no" },
  "content.comment":      { owner: "yes", admin: "yes", manager: "yes",   creator: "yes",    responder: "no",    analyst: "no",  client_approver: "yes",      viewer: "no" },
  "content.publish":      { owner: "yes", admin: "yes", manager: "yes",   creator: "policy", responder: "no",    analyst: "no",  client_approver: "no",       viewer: "no" },
  "approvals.decide":     { owner: "yes", admin: "yes", manager: "yes",   creator: "no",     responder: "no",    analyst: "no",  client_approver: "assigned", viewer: "no" },
  "conversations.handle": { owner: "yes", admin: "yes", manager: "yes",   creator: "grant",  responder: "yes",   analyst: "no",  client_approver: "no",       viewer: "no" },
  "campaigns.manage":     { owner: "yes", admin: "yes", manager: "yes",   creator: "no",     responder: "no",    analyst: "no",  client_approver: "no",       viewer: "no" },
  "campaigns.draft":      { owner: "yes", admin: "yes", manager: "yes",   creator: "yes",    responder: "no",    analyst: "no",  client_approver: "no",       viewer: "no" },
  "campaigns.analyze":    { owner: "yes", admin: "yes", manager: "yes",   creator: "no",     responder: "no",    analyst: "yes", client_approver: "no",       viewer: "no" },
  "analytics.view":       { owner: "yes", admin: "yes", manager: "yes",   creator: "no",     responder: "no",    analyst: "yes", client_approver: "no",       viewer: "yes" },
  "analytics.view_scoped":{ owner: "yes", admin: "yes", manager: "yes",   creator: "yes",    responder: "yes",   analyst: "yes", client_approver: "yes",      viewer: "yes" },
  "reports.export":       { owner: "yes", admin: "yes", manager: "yes",   creator: "grant",  responder: "grant", analyst: "yes", client_approver: "grant",    viewer: "grant" },
  "audit.view":           { owner: "yes", admin: "yes", manager: "grant", creator: "no",     responder: "no",    analyst: "no",  client_approver: "no",       viewer: "no" },
};

export type Principal = {
  role: WorkspaceRole;
  grants: readonly string[];
};

export type Decision = "allow" | "deny" | "policy" | "assigned";

/**
 * Pure decision. `policy` and `assigned` mean "allowed subject to a runtime
 * check" (approval policy for creators publishing; assignment for client
 * approvers) — callers must resolve those explicitly.
 */
export function decide(p: Principal, cap: Capability): Decision {
  const cell = MATRIX[cap][p.role];
  switch (cell) {
    case "yes":
      return "allow";
    case "grant":
      return p.grants.includes(cap) ? "allow" : "deny";
    case "policy":
      return "policy";
    case "assigned":
      return "assigned";
    default:
      return "deny";
  }
}

/** Plain allow/deny; treats policy/assigned as deny unless the caller resolved them. */
export function can(p: Principal, cap: Capability, resolved?: { policyAllows?: boolean; isAssigned?: boolean }): boolean {
  const d = decide(p, cap);
  if (d === "allow") return true;
  if (d === "policy") return resolved?.policyAllows === true;
  if (d === "assigned") return resolved?.isAssigned === true;
  return false;
}

/** Capabilities a role may be granted beyond its preset (for the Team UI). */
export function grantableFor(role: WorkspaceRole): Capability[] {
  return CAPABILITIES.filter((c) => MATRIX[c][role] === "grant");
}

/** Everything a principal can do outright (for the UI's "what can I do" needs). */
export function capabilitiesOf(p: Principal): Capability[] {
  return CAPABILITIES.filter((c) => decide(p, c) === "allow");
}

export class AuthorizationError extends Error {
  readonly capability: Capability;
  constructor(cap: Capability) {
    super(`Not permitted: ${cap}`);
    this.name = "AuthorizationError";
    this.capability = cap;
  }
}
