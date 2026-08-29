/** Shapes for the publish receipt. Kept DB-free so the assembler stays pure and testable. */
import type { PostVariant, PublishJobRow } from "@/db/schema/content";

export type StepIcon = "check" | "clock" | "send" | "sync" | "alert" | "dash";
export type StepTone = "done" | "pending" | "problem";

export type ReceiptStep = {
  key: string;
  icon: StepIcon;
  tone: StepTone;
  label: string;
  detail?: string;
  /** Remote id in full, when the step has one (the label carries a shortened form). */
  fullId?: string | null;
  href?: string | null;
  at: Date | null;
};

export type ReceiptOutcome = "draft" | "scheduled" | "in_flight" | "confirmed" | "retrying" | "failed" | "removed" | "canceled";

export type ReceiptVariant = Pick<
  PostVariant,
  "id" | "status" | "scheduledAt" | "publishedAt" | "remoteId" | "remoteUrl" | "lastError" | "attempts" | "validation" | "idempotencyKey"
>;

export type RemotePublicationRef = { state: string; lastCheckedAt: Date | null };

export type ReceiptInput = {
  variant: ReceiptVariant;
  channel: { name: string; network: string };
  /** Every publish_job for this variant, any order. */
  jobs?: PublishJobRow[];
  approvedAt?: Date | null;
  publication?: RemotePublicationRef | null;
};

export type PublishReceipt = {
  variantId: string;
  channelName: string;
  network: string;
  networkLabel: string;
  outcome: ReceiptOutcome;
  /** One-line status, e.g. "Confirmed by Instagram · id 1789…". */
  headline: string;
  /** One factual sentence about what happened. */
  summary: string;
  steps: ReceiptStep[];
  attempts: number;
  /** True when at least one attempt went through reconcile-before-retry. */
  reconciled: boolean;
  remoteId: string | null;
  permalink: string | null;
  nextAction: string | null;
};

/** Compact form for calendar chips and lists. */
export type ReceiptChip = { outcome: ReceiptOutcome; icon: StepIcon; tone: StepTone; label: string; tooltip: string };
