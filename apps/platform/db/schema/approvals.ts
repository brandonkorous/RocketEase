/*
 * Approvals & collaboration (permissions.md "Approval policy", content-model.md
 * "Approval state", requirements COL-001..004).
 *
 * Decisions are immutable events; current state is derived and cached on the
 * content item. Any material edit after approval supersedes it.
 */
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";
import { contentItem, contentVersion } from "./content";
import type { WorkspaceRole } from "./app";

const id = (name = "id") =>
  text(name)
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export type PolicyRule = {
  /** Which posts this rule applies to; empty = all. */
  channelIds?: string[];
  authorRoles?: WorkspaceRole[];
  campaignIds?: string[];
  /** Require approval when any paid budget is attached (M6). */
  paidSpend?: boolean;
  riskLabels?: string[];
};

export const approvalPolicy = pgTable(
  "approval_policy",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    rule: jsonb("rule").$type<PolicyRule>().notNull().default({}),
    /** Who may approve: workspace roles and/or specific users. */
    approverRoles: jsonb("approver_roles").$type<WorkspaceRole[]>().notNull().default(["owner", "admin", "manager"]),
    approverUserIds: jsonb("approver_user_ids").$type<string[]>().notNull().default([]),
    /** Author can never satisfy their own request when true. */
    separationOfDuty: boolean("separation_of_duty").notNull().default(true),
    /** Default due window (hours) from request. */
    dueHours: integer("due_hours").notNull().default(24),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("approval_policy_ws_idx").on(t.workspaceId, t.enabled)],
);

export const REQUEST_STATES = ["pending", "approved", "changes_requested", "rejected", "superseded", "canceled"] as const;
export type RequestState = (typeof REQUEST_STATES)[number];
export const requestState = pgEnum("approval_request_state", REQUEST_STATES);

export const approvalRequest = pgTable(
  "approval_request",
  {
    id: id(),
    organizationId: text("organization_id").notNull(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    contentItemId: text("content_item_id").notNull().references(() => contentItem.id, { onDelete: "cascade" }),
    /** The immutable version under review. */
    versionId: text("version_id").notNull().references(() => contentVersion.id, { onDelete: "cascade" }),
    policyId: text("policy_id").references(() => approvalPolicy.id, { onDelete: "set null" }),
    requestedByUserId: text("requested_by_user_id").references(() => user.id, { onDelete: "set null" }),
    assigneeUserId: text("assignee_user_id").references(() => user.id, { onDelete: "set null" }),
    /** Roles allowed to decide when no specific assignee is set. */
    approverRoles: jsonb("approver_roles").$type<WorkspaceRole[]>().notNull().default(["owner", "admin", "manager"]),
    separationOfDuty: boolean("separation_of_duty").notNull().default(true),
    state: requestState("state").notNull().default("pending"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    /** Schedule to apply automatically once approved ("YYYY-MM-DDTHH:mm" local, or "now"). */
    scheduleOnApprove: text("schedule_on_approve"),
    note: text("note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("approval_request_ws_state_idx").on(t.workspaceId, t.state, t.dueAt), index("approval_request_item_idx").on(t.contentItemId)],
);

export const DECISIONS = ["approved", "changes_requested", "rejected"] as const;
export type Decision = (typeof DECISIONS)[number];
export const decision = pgEnum("approval_decision_kind", DECISIONS);

/** Immutable. Never updated or deleted. */
export const approvalDecision = pgTable(
  "approval_decision",
  {
    id: id(),
    requestId: text("request_id").notNull().references(() => approvalRequest.id, { onDelete: "cascade" }),
    versionId: text("version_id").notNull(),
    decidedByUserId: text("decided_by_user_id").references(() => user.id, { onDelete: "set null" }),
    decision: decision("decision").notNull(),
    /** Required for changes_requested / rejected. */
    comment: text("comment"),
    createdAt: now("created_at"),
  },
  (t) => [index("approval_decision_request_idx").on(t.requestId)],
);

/** Comments attach to an item, optionally to a version / field / asset. */
export const comment = pgTable(
  "comment",
  {
    id: id(),
    organizationId: text("organization_id").notNull(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    contentItemId: text("content_item_id").notNull().references(() => contentItem.id, { onDelete: "cascade" }),
    versionId: text("version_id"),
    field: text("field"),
    assetId: text("asset_id"),
    parentId: text("parent_id"),
    authorUserId: text("author_user_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: text("resolved_by_user_id"),
    createdAt: now("created_at"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => [index("comment_item_idx").on(t.contentItemId, t.createdAt)],
);

export type ApprovalPolicy = typeof approvalPolicy.$inferSelect;
export type ApprovalRequest = typeof approvalRequest.$inferSelect;
export type ApprovalDecisionRow = typeof approvalDecision.$inferSelect;
export type Comment = typeof comment.$inferSelect;
