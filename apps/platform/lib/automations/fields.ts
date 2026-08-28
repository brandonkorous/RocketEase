/*
 * Field catalog per trigger. Drives the builder's field picker, the operator
 * list, and the dry-run — a condition on a field this trigger does not publish
 * can never match, so the builder only offers what facts.ts actually supplies.
 */
import type { Operator, TriggerKind } from "@/db/schema/automations";

export type FieldType = "text" | "number" | "boolean" | "enum" | "tags";
export type FieldDef = { key: string; label: string; type: FieldType; ops: Operator[]; options?: string[]; hint?: string };

const ALL_OPS: Operator[] = ["eq", "neq", "contains", "matches", "gt", "lt", "in"];
const TEXT: Operator[] = ["eq", "neq", "contains", "matches", "in"];
const ENUM: Operator[] = ["eq", "neq", "in"];
const NUMBER: Operator[] = ["gt", "lt", "eq", "neq"];
const BOOL: Operator[] = ["eq"];
const TAGS: Operator[] = ["eq", "neq", "contains", "in"];

const NETWORK: FieldDef = { key: "network", label: "Network", type: "text", ops: ENUM, hint: "instagram, facebook, linkedin, tiktok…" };
const CHANNEL: FieldDef = { key: "channel", label: "Channel name", type: "text", ops: TEXT };
const CAMPAIGN: FieldDef = { key: "campaign", label: "Campaign name", type: "text", ops: TEXT };

const INBOX: FieldDef[] = [
  NETWORK,
  CHANNEL,
  { key: "kind", label: "Type", type: "enum", ops: ENUM, options: ["comment", "mention", "message", "review"] },
  { key: "text", label: "Message text", type: "text", ops: TEXT },
  { key: "contact_tags", label: "Contact tag", type: "tags", ops: TAGS },
  { key: "priority", label: "Current priority", type: "enum", ops: ENUM, options: ["low", "normal", "high", "urgent"] },
  { key: "business_hours", label: "In business hours", type: "boolean", ops: BOOL, options: ["true", "false"], hint: "Mon–Fri 09:00–17:00 in the workspace timezone" },
  { key: "first_message", label: "First message in thread", type: "boolean", ops: BOOL, options: ["true", "false"] },
  { key: "rating", label: "Review rating", type: "number", ops: NUMBER, hint: "Reviews only; 1–5" },
];

const PUBLISH: FieldDef[] = [
  NETWORK,
  CHANNEL,
  CAMPAIGN,
  { key: "format", label: "Format", type: "text", ops: ENUM },
  { key: "title", label: "Post title", type: "text", ops: TEXT },
  { key: "text", label: "Post text", type: "text", ops: TEXT },
];

const FAILURE: FieldDef[] = [
  ...PUBLISH,
  { key: "failure_category", label: "Failure category", type: "text", ops: ENUM, hint: "rate_limit, permission, validation, provider…" },
  { key: "failure_message", label: "Failure message", type: "text", ops: TEXT },
  { key: "ambiguous", label: "Outcome was ambiguous", type: "boolean", ops: BOOL, options: ["true", "false"] },
  { key: "attempt", label: "Attempt number", type: "number", ops: NUMBER },
];

const APPROVAL: FieldDef[] = [
  { key: "decision", label: "Decision", type: "enum", ops: ENUM, options: ["approved", "changes_requested", "rejected"] },
  { key: "title", label: "Post title", type: "text", ops: TEXT },
  CAMPAIGN,
  { key: "overdue", label: "Decided after the due date", type: "boolean", ops: BOOL, options: ["true", "false"] },
  { key: "has_comment", label: "Has a reviewer comment", type: "boolean", ops: BOOL, options: ["true", "false"] },
];

const BUDGET: FieldDef[] = [
  { key: "spend_percent", label: "Spend (% of planned budget)", type: "number", ops: NUMBER },
  { key: "spend", label: "Spend to date", type: "number", ops: NUMBER },
  { key: "budget", label: "Planned budget", type: "number", ops: NUMBER },
  { key: "objective", label: "Objective", type: "enum", ops: ENUM, options: ["awareness", "engagement", "traffic", "leads", "conversions"] },
  { key: "status", label: "Campaign status", type: "enum", ops: ENUM, options: ["draft", "active", "paused", "completed"] },
  { key: "campaign", label: "Campaign name", type: "text", ops: TEXT },
];

export const FIELDS: Record<TriggerKind, FieldDef[]> = {
  "inbox.message_received": INBOX,
  "post.published": PUBLISH,
  "post.failed": FAILURE,
  "approval.decided": APPROVAL,
  "campaign.budget_threshold": BUDGET,
};

export const fieldsFor = (trigger: TriggerKind): FieldDef[] => FIELDS[trigger] ?? [];
export const fieldDef = (trigger: TriggerKind, key: string) => fieldsFor(trigger).find((f) => f.key === key);
export const opsFor = (trigger: TriggerKind, key: string): Operator[] => fieldDef(trigger, key)?.ops ?? ALL_OPS;
