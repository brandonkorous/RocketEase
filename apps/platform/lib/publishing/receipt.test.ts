import { describe, expect, it } from "vitest";
import type { PublishJobRow, VariantError } from "@/db/schema/content";
import { buildReceipt, receiptChip, type ReceiptInput, type ReceiptVariant } from "./receipt";

const AT = new Date("2026-08-20T10:00:00.000Z");

function variant(over: Partial<ReceiptVariant> = {}): ReceiptVariant {
  return {
    id: "v1", status: "draft", scheduledAt: null, publishedAt: null, remoteId: null, remoteUrl: null,
    lastError: null, attempts: 0, validation: null, idempotencyKey: "1c9dd3f0-5f5a-4a5e-9a1d-6b2c8f0e11aa",
    ...over,
  };
}

function job(over: Partial<PublishJobRow> = {}): PublishJobRow {
  return {
    id: "j1", workspaceId: "ws", variantId: "v1", versionId: "ver1", scheduledFor: AT, state: "succeeded",
    attempt: 1, lastError: null, startedAt: AT, finishedAt: AT, createdAt: AT, ...over,
  } as PublishJobRow;
}

const ambiguous: VariantError = { category: "temporary", message: "Request timed out", ambiguous: true, at: AT.toISOString() };
const input = (over: Partial<ReceiptInput> = {}): ReceiptInput => ({ variant: variant(), channel: { name: "Acme IG", network: "instagram" }, ...over });
const stepKeys = (r: ReturnType<typeof buildReceipt>) => r.steps.map((s) => s.key);

describe("buildReceipt", () => {
  it("reports a draft with no steps beyond what exists", () => {
    const r = buildReceipt(input());
    expect(r.outcome).toBe("draft");
    expect(r.steps).toEqual([]);
    expect(r.nextAction).toBeNull();
  });

  it("shows validation results with the ruleset version", () => {
    const validation = { issues: [{ severity: "warning" as const, code: "text.long", message: "Long caption" }], rulesetVersion: "2026.08", checkedAt: AT.toISOString() };
    const r = buildReceipt(input({ variant: variant({ status: "scheduled", scheduledAt: AT, validation }) }));
    expect(r.steps[0]).toMatchObject({ key: "validated", tone: "done", label: "Validated" });
    expect(r.steps[0].detail).toBe("1 warning · ruleset 2026.08");
    expect(stepKeys(r)).toEqual(["validated", "sent"]);
    expect(r.steps[1]).toMatchObject({ label: "Queued for Instagram", tone: "pending" });
  });

  it("flags a blocking validation issue instead of a pass", () => {
    const validation = { issues: [{ severity: "error" as const, code: "media.missing", message: "Instagram needs at least one image" }], rulesetVersion: "2026.08", checkedAt: AT.toISOString() };
    const r = buildReceipt(input({ variant: variant({ status: "failed", validation, lastError: { category: "validation", message: "Instagram needs at least one image", at: AT.toISOString() } }) }));
    expect(r.steps[0]).toMatchObject({ tone: "problem", label: "Blocked by Instagram's rules", detail: "Instagram needs at least one image" });
    expect(r.nextAction).toBe("Fix the content, then schedule again.");
  });

  it("confirms a published variant with the network and a shortened remote id", () => {
    const v = variant({ status: "published", publishedAt: AT, remoteId: "17895695668004550", remoteUrl: "https://example.test/p/1", attempts: 1 });
    const r = buildReceipt(input({ variant: v, jobs: [job()], approvedAt: AT }));
    expect(r.outcome).toBe("confirmed");
    expect(r.headline).toBe("Confirmed by Instagram · id 1789…");
    expect(r.summary).toBe("Instagram confirmed this post and returned an id.");
    expect(stepKeys(r)).toEqual(["validated", "approved", "sent", "confirmed"]);
    const confirmed = r.steps.at(-1)!;
    expect(confirmed).toMatchObject({ href: "https://example.test/p/1", fullId: "17895695668004550", detail: "id 1789…" });
    expect(r.steps[2].detail).toContain("Attempt 1 · idempotency key 1c9dd3f0…");
    expect(r.reconciled).toBe(false);
  });

  it("uses the reconciliation copy when an ambiguous attempt preceded success", () => {
    const v = variant({ status: "published", publishedAt: AT, remoteId: "999", attempts: 2 });
    const jobs = [job({ id: "j1", attempt: 1, state: "failed", lastError: ambiguous }), job({ id: "j2", attempt: 2 })];
    const r = buildReceipt(input({ variant: v, jobs }));
    expect(r.reconciled).toBe(true);
    expect(stepKeys(r)).toEqual(["validated", "sent", "reconciled", "confirmed"]);
    expect(r.steps[2].detail).toContain("No duplicate was sent.");
    expect(r.summary).toBe("Instagram's response was ambiguous, so we checked before retrying; no duplicate was sent.");
    expect(receiptChip(r).label).toBe("Confirmed · reconciled");
  });

  it("explains an ambiguous timeout with the no-duplicate promise", () => {
    const v = variant({ status: "scheduled", scheduledAt: AT, lastError: ambiguous, attempts: 1 });
    const jobs = [job({ attempt: 1, state: "failed", lastError: ambiguous }), job({ id: "j2", attempt: 2, state: "queued", startedAt: null, finishedAt: null, scheduledFor: new Date("2026-08-20T10:01:00.000Z") })];
    const r = buildReceipt(input({ variant: v, jobs }));
    expect(r.outcome).toBe("retrying");
    expect(r.summary).toBe("Network timed out — we checked before retrying; no duplicate was sent.");
    const retry = r.steps.at(-1)!;
    expect(retry).toMatchObject({ key: "retry", tone: "pending", label: "Retry scheduled" });
    expect(retry.detail).toContain("Attempt 2 is queued.");
    expect(retry.at).toEqual(new Date("2026-08-20T10:01:00.000Z"));
  });

  it("sorts jobs by attempt and reports the latest send", () => {
    const later = new Date("2026-08-20T11:00:00.000Z");
    const jobs = [job({ id: "j2", attempt: 2, startedAt: later }), job({ id: "j1", attempt: 1 })];
    const r = buildReceipt(input({ variant: variant({ status: "publishing", attempts: 2 }), jobs }));
    expect(r.steps.find((s) => s.key === "sent")).toMatchObject({ at: later, detail: "Attempt 2 · idempotency key 1c9dd3f0…" });
    expect(r.outcome).toBe("in_flight");
  });

  it("names a permanent failure, its category and the next action", () => {
    const lastError: VariantError = { category: "permission", message: "Channel is disconnected", at: AT.toISOString() };
    const r = buildReceipt(input({ variant: variant({ status: "failed", lastError, attempts: 1 }), jobs: [job({ state: "failed", lastError })] }));
    expect(r.outcome).toBe("failed");
    expect(r.headline).toBe("Not published");
    expect(r.summary).toBe("The connection was rejected — Channel is disconnected");
    expect(r.nextAction).toBe("Reconnect this channel under Connected accounts, then retry.");
    expect(r.reconciled).toBe(false);
  });

  it("adds what the nightly reconcile last saw", () => {
    const checked = new Date("2026-08-21T02:00:00.000Z");
    const v = variant({ status: "published", publishedAt: AT, remoteId: "abc", attempts: 1 });
    const live = buildReceipt(input({ variant: v, jobs: [job()], publication: { state: "published", lastCheckedAt: checked } }));
    expect(live.steps.at(-1)).toMatchObject({ key: "liveness", label: "Still live on Instagram", at: checked });

    const gone = buildReceipt(input({ variant: v, jobs: [job()], publication: { state: "deleted", lastCheckedAt: checked } }));
    expect(gone.outcome).toBe("removed");
    expect(gone.headline).toBe("Removed at Instagram");
    expect(gone.steps.at(-1)).toMatchObject({ tone: "problem", label: "Removed at Instagram" });
  });

  it("omits the liveness step until a check has run", () => {
    const v = variant({ status: "published", publishedAt: AT, remoteId: "abc" });
    const r = buildReceipt(input({ variant: v, publication: { state: "published", lastCheckedAt: null } }));
    expect(stepKeys(r)).not.toContain("liveness");
  });

  it("labels the demo network by name", () => {
    const r = buildReceipt(input({ variant: variant({ status: "published", publishedAt: AT, remoteId: "1" }), channel: { name: "Demo", network: "mock" } }));
    expect(r.headline).toBe("Confirmed by Demo network · id 1");
  });
});

describe("receiptChip", () => {
  it("carries an icon, a label and a factual tooltip", () => {
    const lastError: VariantError = { category: "rate_limit", message: "Too many requests", at: AT.toISOString() };
    const chip = receiptChip(buildReceipt(input({ variant: variant({ status: "failed", lastError }) })));
    expect(chip).toMatchObject({ outcome: "failed", icon: "alert", tone: "problem", label: "Not published" });
    expect(chip.tooltip).toContain("Acme IG · Not published");
    expect(chip.tooltip).toContain("Rate limit reached — Too many requests");
    expect(chip.tooltip).toContain("Retry later.");
  });

  it("stays neutral for a draft", () => {
    expect(receiptChip(buildReceipt(input()))).toMatchObject({ icon: "dash", tone: "pending", label: "Draft" });
  });
});
