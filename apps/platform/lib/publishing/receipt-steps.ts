/** Step builders for the publish receipt. Each returns null when its data doesn't exist. */
import type { PublishJobRow } from "@/db/schema/content";
import { failureSummary, shortId, shortKey } from "./receipt-copy";
import type { ReceiptStep, ReceiptVariant, RemotePublicationRef } from "./receipt-types";

export function validatedStep(v: ReceiptVariant, net: string): ReceiptStep | null {
  const val = v.validation;
  if (!val) {
    if (v.status === "draft") return null;
    return { key: "validated", icon: "check", tone: "done", label: "Validated", detail: `Re-checked against ${net}'s rules before sending.`, at: null };
  }
  const errors = val.issues.filter((i) => i.severity === "error");
  const warnings = val.issues.length - errors.length;
  const passed = warnings ? `${warnings} warning${warnings === 1 ? "" : "s"} · ruleset ${val.rulesetVersion}` : `No blocking issues · ruleset ${val.rulesetVersion}`;
  return {
    key: "validated",
    icon: errors.length ? "alert" : "check",
    tone: errors.length ? "problem" : "done",
    label: errors.length ? `Blocked by ${net}'s rules` : "Validated",
    detail: errors.length ? errors[0].message : passed,
    at: new Date(val.checkedAt),
  };
}

export function approvedStep(approvedAt: Date | null): ReceiptStep | null {
  if (!approvedAt) return null;
  return { key: "approved", icon: "check", tone: "done", label: "Approved", detail: "Approved on the version that was scheduled.", at: approvedAt };
}

/** Sent, or queued when nothing has left yet. */
export function sentStep(v: ReceiptVariant, jobs: PublishJobRow[], net: string): ReceiptStep | null {
  const started = [...jobs].reverse().find((j) => j.startedAt);
  if (started) {
    return {
      key: "sent",
      icon: "send",
      tone: "done",
      label: `Sent to ${net}`,
      detail: `Attempt ${started.attempt} · idempotency key ${shortKey(v.idempotencyKey)}`,
      at: started.startedAt,
    };
  }
  if (v.publishedAt) return { key: "sent", icon: "send", tone: "done", label: `Sent to ${net}`, detail: `Idempotency key ${shortKey(v.idempotencyKey)}`, at: null };
  if (v.status === "scheduled" && v.scheduledAt) return { key: "sent", icon: "clock", tone: "pending", label: `Queued for ${net}`, detail: "Nothing has been sent yet.", at: v.scheduledAt };
  return null;
}

/** Only ever shown when an attempt actually went through reconciliation. */
export function reconciledStep(v: ReceiptVariant, jobs: PublishJobRow[], net: string): ReceiptStep {
  const marker = jobs.find((j) => j.reconciled) ?? jobs.find((j) => j.lastError?.ambiguous) ?? jobs.find((j) => j.state === "reconciling");
  const published = v.status === "published";
  return {
    key: "reconciled",
    icon: "sync",
    tone: published ? "done" : "problem",
    label: `Reconciled with ${net}`,
    detail: published
      ? "The response was ambiguous, so we asked the network what existed before retrying. No duplicate was sent."
      : "The response was ambiguous, so we checked before retrying. Nothing was published, and no duplicate was sent.",
    at: marker?.finishedAt ?? null,
  };
}

export function outcomeStep(v: ReceiptVariant, jobs: PublishJobRow[], net: string): ReceiptStep | null {
  if (v.status === "published") {
    return {
      key: "confirmed",
      icon: "check",
      tone: "done",
      label: `Confirmed by ${net}`,
      detail: v.remoteId ? `id ${shortId(v.remoteId)}` : "The network confirmed the post.",
      fullId: v.remoteId,
      href: v.remoteUrl,
      at: v.publishedAt,
    };
  }
  if (v.status === "publishing") return { key: "in_flight", icon: "sync", tone: "pending", label: `Sending to ${net}`, detail: "Waiting for the network to answer.", at: null };
  if (!v.lastError) return v.status === "canceled" ? { key: "canceled", icon: "dash", tone: "pending", label: "Canceled", detail: "This destination was taken off the schedule.", at: null } : null;
  const next = jobs.find((j) => j.state === "queued");
  if (v.status === "scheduled") {
    return { key: "retry", icon: "clock", tone: "pending", label: "Retry scheduled", detail: `${failureSummary(v.lastError)} Attempt ${next?.attempt ?? v.attempts + 1} is queued.`, at: next?.scheduledFor ?? null };
  }
  return { key: "failed", icon: "alert", tone: "problem", label: "Not published", detail: failureSummary(v.lastError), at: new Date(v.lastError.at) };
}

/** What the nightly publication.reconcile job last saw at the network. */
export function livenessStep(pub: RemotePublicationRef | null | undefined, net: string): ReceiptStep | null {
  if (!pub || !pub.lastCheckedAt) return null;
  if (pub.state === "deleted") return { key: "liveness", icon: "alert", tone: "problem", label: `Removed at ${net}`, detail: "It was there when we published; the network no longer returns it.", at: pub.lastCheckedAt };
  if (pub.state === "unknown") return { key: "liveness", icon: "sync", tone: "pending", label: `Couldn't confirm with ${net}`, detail: "Our last check didn't get a definite answer.", at: pub.lastCheckedAt };
  return { key: "liveness", icon: "check", tone: "done", label: `Still live on ${net}`, detail: "Confirmed by our daily check.", at: pub.lastCheckedAt };
}
