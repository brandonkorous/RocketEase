/*
 * Automation rules with approval gates (roadmap.md Phase 5, flows.md "Unified
 * inbox" step 2).
 *
 * permissions.md "Service accounts and automation": an automated action must
 * identify its rule and triggering event, and can never exceed the capabilities
 * of the person who created the rule. `created_by_user_id` is that person; the
 * worker re-checks their capabilities on every run.
 *
 * The approval gate is its own table because approval_request is content-item
 * centric (it requires a content item + frozen version); an automation parks a
 * run, not a post.
 */
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace, type WorkspaceRole } from "./app";

const id = (name = "id") => text(name).primaryKey().default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const scoped = () => ({
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
});

export const TRIGGERS = ["inbox.message_received", "post.published", "post.failed", "approval.decided", "campaign.budget_threshold"] as const;
export type TriggerKind = (typeof TRIGGERS)[number];
export const triggerKind = pgEnum("automation_trigger", TRIGGERS);

export const OPERATORS = ["eq", "neq", "contains", "matches", "gt", "lt", "in"] as const;
export type Operator = (typeof OPERATORS)[number];

/** One `field op value` test. `value` is stored as text; numeric ops coerce. */
export type Condition = { field: string; op: Operator; value: string };
/** `all` = every condition must hold; `any` = at least one. No conditions = always matches. */
export type ConditionGroup = { match: "all" | "any"; conditions: Condition[] };

export const ACTION_KINDS = [
  "inbox.assign",
  "inbox.assign_round_robin",
  "inbox.set_priority",
  "inbox.add_tag",
  "inbox.saved_reply",
  "inbox.snooze",
  "notify",
  "publish.request_approval",
  "publish.retry",
  "campaign.pause_promotion",
  "campaign.pause_ads",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export type RuleAction =
  | { kind: "inbox.assign"; userId: string }
  | { kind: "inbox.assign_round_robin"; role: WorkspaceRole }
  | { kind: "inbox.set_priority"; priority: "low" | "normal" | "high" | "urgent" }
  | { kind: "inbox.add_tag"; tag: string }
  /** Auto-send only when the creator holds conversations.handle AND set autoSend; never on reviews. */
  | { kind: "inbox.saved_reply"; savedReplyId: string; autoSend?: boolean }
  | { kind: "inbox.snooze"; hours: number }
  | { kind: "notify"; userIds?: string[]; roles?: WorkspaceRole[]; message?: string }
  | { kind: "publish.request_approval"; assigneeUserId?: string | null }
  | { kind: "publish.retry"; delayMinutes?: number }
  | { kind: "campaign.pause_promotion" }
  | { kind: "campaign.pause_ads" };

export type TriggerConfig = {
  /** campaign.budget_threshold: percent of planned budget that must be reached. */
  thresholdPercent?: number;
  /** Restrict to these channels (empty = all). */
  channelIds?: string[];
};

export const automationRule = pgTable(
  "automation_rule",
  {
    id: id(),
    ...scoped(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    trigger: triggerKind("trigger").notNull(),
    triggerConfig: jsonb("trigger_config").$type<TriggerConfig>().notNull().default({}),
    conditions: jsonb("conditions").$type<ConditionGroup>().notNull().default({ match: "all", conditions: [] }),
    /** Ordered; applied in sequence, each one recorded in the run. */
    actions: jsonb("actions").$type<RuleAction[]>().notNull().default([]),
    /** Park every run for a human decision, whatever the actions are. */
    requiresApproval: boolean("requires_approval").notNull().default(false),
    approverRoles: jsonb("approver_roles").$type<WorkspaceRole[]>().notNull().default(["owner", "admin", "manager"]),
    /** The automation acts as this user; its capabilities cap what the rule may do. */
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    lastRunAt: ts("last_run_at"),
    runCount: integer("run_count").notNull().default(0),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("automation_rule_ws_trigger_idx").on(t.workspaceId, t.trigger, t.enabled)],
);

export const RUN_STATUSES = ["matched", "skipped", "awaiting_approval", "applied", "failed", "rejected"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const runStatus = pgEnum("automation_run_status", RUN_STATUSES);

export type ConditionResult = { field: string; op: Operator; value: string; actual: string; matched: boolean; note?: string };
export type RunEvaluation = { match: "all" | "any"; matched: boolean; results: ConditionResult[]; explanation: string };
export type ActionOutcome = { kind: ActionKind; status: "applied" | "skipped" | "failed"; detail: string };

/**
 * One evaluation that matched. Non-matching evaluations are not recorded — the
 * unique key below is what makes re-delivery of a trigger idempotent, so a
 * "did not match yet" row would permanently block later re-evaluation.
 */
export const automationRun = pgTable(
  "automation_run",
  {
    id: id(),
    ...scoped(),
    ruleId: text("rule_id").notNull().references(() => automationRule.id, { onDelete: "cascade" }),
    triggerType: triggerKind("trigger_type").notNull(),
    /** The subject the rule acted on: message, post variant, approval request, campaign. */
    triggerRefId: text("trigger_ref_id").notNull(),
    status: runStatus("status").notNull().default("matched"),
    evaluation: jsonb("evaluation").$type<RunEvaluation>().notNull(),
    actionsResult: jsonb("actions_result").$type<ActionOutcome[]>().notNull().default([]),
    approvalId: text("approval_id"),
    /** Why a run was skipped or failed, in the user's words. */
    reason: text("reason"),
    createdAt: now("created_at"),
    finishedAt: ts("finished_at"),
  },
  (t) => [
    uniqueIndex("automation_run_rule_ref_idx").on(t.ruleId, t.triggerRefId),
    index("automation_run_rule_created_idx").on(t.ruleId, t.createdAt),
    index("automation_run_ws_status_idx").on(t.workspaceId, t.status, t.createdAt),
  ],
);

export const APPROVAL_STATES = ["pending", "approved", "rejected", "expired"] as const;
export type AutomationApprovalState = (typeof APPROVAL_STATES)[number];
export const automationApprovalState = pgEnum("automation_approval_state", APPROVAL_STATES);

/** The human gate in front of a parked run. Surfaces in the Approvals queue. */
export const automationApproval = pgTable(
  "automation_approval",
  {
    id: id(),
    ...scoped(),
    runId: text("run_id").notNull().references(() => automationRun.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull().references(() => automationRule.id, { onDelete: "cascade" }),
    state: automationApprovalState("state").notNull().default("pending"),
    approverRoles: jsonb("approver_roles").$type<WorkspaceRole[]>().notNull().default(["owner", "admin", "manager"]),
    /** What the run will do if approved, in plain words. */
    summary: text("summary").notNull(),
    dueAt: ts("due_at"),
    decidedByUserId: text("decided_by_user_id").references(() => user.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    comment: text("comment"),
    createdAt: now("created_at"),
  },
  (t) => [index("automation_approval_ws_state_idx").on(t.workspaceId, t.state, t.createdAt), uniqueIndex("automation_approval_run_idx").on(t.runId)],
);

export type AutomationRule = typeof automationRule.$inferSelect;
export type AutomationRun = typeof automationRun.$inferSelect;
export type AutomationApproval = typeof automationApproval.$inferSelect;
