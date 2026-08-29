/**
 * Publish receipts — the delivery record for one post_variant.
 *
 * Everything is derived from data the publishing path already writes:
 * post_variant (status, validation, timestamps, remote id, last error, attempts,
 * idempotency key), publish_job rows (attempt, state, startedAt/finishedAt,
 * lastError.ambiguous) and remote_publication (what the nightly reconcile saw).
 * Pure and DB-free on purpose: the caller loads, this assembles.
 */
import { OUTCOME_LABEL, failureSummary, networkLabel, nextActionFor, shortId } from "./receipt-copy";
import { approvedStep, livenessStep, outcomeStep, reconciledStep, sentStep, validatedStep } from "./receipt-steps";
import type { PublishReceipt, ReceiptChip, ReceiptInput, ReceiptOutcome, ReceiptStep, ReceiptVariant } from "./receipt-types";

export * from "./receipt-types";
export { NETWORK_LABEL, networkLabel, shortId } from "./receipt-copy";

const ICON_FOR: Record<ReceiptOutcome, ReceiptChip["icon"]> = {
  draft: "dash", scheduled: "clock", in_flight: "sync", confirmed: "check",
  retrying: "clock", failed: "alert", removed: "alert", canceled: "dash",
};
const TONE_FOR: Record<ReceiptOutcome, ReceiptChip["tone"]> = {
  draft: "pending", scheduled: "pending", in_flight: "pending", confirmed: "done",
  retrying: "pending", failed: "problem", removed: "problem", canceled: "pending",
};

export function buildReceipt(input: ReceiptInput): PublishReceipt {
  const v = input.variant;
  const jobs = [...(input.jobs ?? [])].sort((a, b) => a.attempt - b.attempt);
  const net = networkLabel(input.channel.network);
  const reconciled = Boolean(v.lastError?.ambiguous) || jobs.some((j) => j.reconciled || j.state === "reconciling" || j.lastError?.ambiguous);
  const outcome = outcomeOf(v, input.publication?.state);

  const steps = [
    validatedStep(v, net),
    approvedStep(input.approvedAt ?? null),
    sentStep(v, jobs, net),
    reconciled ? reconciledStep(v, jobs, net) : null,
    outcomeStep(v, jobs, net),
    livenessStep(input.publication, net),
  ].filter((s): s is ReceiptStep => s !== null);

  return {
    variantId: v.id,
    channelName: input.channel.name,
    network: input.channel.network,
    networkLabel: net,
    outcome,
    headline: headlineOf(outcome, v, net),
    summary: summaryOf(outcome, v, net, reconciled),
    steps,
    attempts: v.attempts,
    reconciled,
    remoteId: v.remoteId,
    permalink: v.remoteUrl,
    nextAction: outcome === "failed" && v.lastError ? nextActionFor(v.lastError.category) : null,
  };
}

function outcomeOf(v: ReceiptVariant, publicationState?: string): ReceiptOutcome {
  if (publicationState === "deleted") return "removed";
  if (v.status === "published") return "confirmed";
  if (v.status === "failed") return "failed";
  if (v.status === "publishing") return "in_flight";
  if (v.status === "canceled") return "canceled";
  if (v.status === "scheduled") return v.lastError ? "retrying" : "scheduled";
  return "draft";
}

function headlineOf(outcome: ReceiptOutcome, v: ReceiptVariant, net: string): string {
  if (outcome === "confirmed") return v.remoteId ? `Confirmed by ${net} · id ${shortId(v.remoteId)}` : `Confirmed by ${net}`;
  if (outcome === "removed") return `Removed at ${net}`;
  if (outcome === "in_flight") return `Sending to ${net}`;
  if (outcome === "scheduled") return `Queued for ${net}`;
  return OUTCOME_LABEL[outcome];
}

function summaryOf(outcome: ReceiptOutcome, v: ReceiptVariant, net: string, reconciled: boolean): string {
  if (outcome === "confirmed") {
    return reconciled
      ? `${net}'s response was ambiguous, so we checked before retrying; no duplicate was sent.`
      : `${net} confirmed this post${v.remoteId ? " and returned an id" : ""}.`;
  }
  if (outcome === "removed") return `${net} no longer returns this post. It was there when we published it.`;
  if (v.lastError) return failureSummary(v.lastError);
  if (outcome === "in_flight") return `Sent to ${net}; waiting for the network to answer.`;
  if (outcome === "scheduled") return "Nothing has been sent to the network yet.";
  if (outcome === "canceled") return "This destination was taken off the schedule.";
  return "Not scheduled yet.";
}

/** Compact chip for the calendar and lists — icon + label, never colour alone. */
export function receiptChip(r: PublishReceipt): ReceiptChip {
  const label = r.outcome === "confirmed" && r.reconciled ? "Confirmed · reconciled" : OUTCOME_LABEL[r.outcome];
  const tooltip = [`${r.channelName} · ${r.headline}`, r.summary, r.nextAction].filter(Boolean).join(" ");
  return { outcome: r.outcome, icon: ICON_FOR[r.outcome], tone: TONE_FOR[r.outcome], label, tooltip };
}
