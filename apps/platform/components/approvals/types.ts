import type { AutomationApprovalRow } from "@/lib/automations/queries";

export type Reviewer = { userId: string; name: string; role: string; image: string | null };
export type ApprovalRow = {
  id: string; itemId: string; title: string; text: string; state: string; itemStatus: string; channels: { id: string; name: string; network: string }[]; thumbUrl: string | null;
  requester: string; requesterId: string | null; assignee: Reviewer | null; dueAt: string | null; dueLabel: string | null; overdue: boolean; createdAt: string; note: string | null; scheduleOnApprove: string | null; versionId: string; stale: boolean;
  canDecide: boolean; decideReason: string | null; canCancel: boolean;
  /** Reviewers and the requester may move a pending request's due time. */
  canSetDue: boolean;
};
export type Snapshot = { text: string; link: string | null; firstComment: string | null; schedule: string | null; media: { id: string; kind: string; url: string | null; fullUrl: string | null; alt: string }[] };
export type VersionRow = { id: string; number: number; reason: string; by: string | null; at: string; current: boolean };
export type TimelineRow = { kind: string; label: string; by: string; at: string };
export type CommentRow = { id: string; by: string; image: string | null; body: string; at: string; mine: boolean; resolved: boolean; field: string | null; assetId: string | null; parentId: string | null };
/** Where a comment can be anchored (COL-002). `null` = the post as a whole. */
export type Anchor = { field: string | null; assetId: string | null };
export const FIELD_LABEL: Record<string, string> = { text: "Post text", link: "Link", first_comment: "First comment", schedule: "Schedule" };
export const anchorKey = (a: Anchor) => (a.assetId ? `asset:${a.assetId}` : a.field ? `field:${a.field}` : "post");
export type ApprovalDetailData = ApprovalRow & { snapshot: Snapshot | null; versions: VersionRow[]; timeline: TimelineRow[]; comments: CommentRow[] };
export type ApprovalsData = {
  workspaceId: string; timezone: string; tab: string; counts: { all: number; pending: number; overdue: number; changes: number; approved: number; scheduled: number }; rows: ApprovalRow[];
  detail: ApprovalDetailData | null; reviewers: Reviewer[]; channels: { id: string; name: string; network: string }[]; filters: { assignee: string; channel: string; sort: string }; canComment: boolean; isClientApprover: boolean;
  /** Automation runs parked behind an approval gate (M7). */
  automations: AutomationApprovalRow[];
};
export type Nav = (patch: Record<string, string | null>) => void;

export const STATE: Record<string, { label: string; color: "success" | "warning" | "error" | "neutral" | "info" }> = {
  pending: { label: "Needs review", color: "info" }, approved: { label: "Approved", color: "success" }, changes_requested: { label: "Changes requested", color: "warning" },
  rejected: { label: "Rejected", color: "error" }, superseded: { label: "Superseded", color: "neutral" }, canceled: { label: "Withdrawn", color: "neutral" },
};
export const TIMELINE_DOT: Record<string, string> = { submitted: "bg-success", assigned: "bg-base-content", approved: "bg-success", changes_requested: "bg-warning", rejected: "bg-error", pending: "border-2 border-info bg-base-100" };
