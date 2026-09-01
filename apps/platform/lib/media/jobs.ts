/*
 * Creating a generation job: route, estimate, check the ceiling, then enqueue.
 *
 * The order matters. Everything that can refuse runs BEFORE a row exists and
 * long before an adapter is touched, so a refusal costs nothing and leaves no
 * half-state. The row and its job are written in one transaction through the
 * outbox, like every other enqueue in the product.
 */
import { randomUUID } from "node:crypto";
import {
  availabilityFrom,
  buildRegistry,
  estimate as estimateCost,
  isRouted,
  parseRates,
  routeJob,
  modelsForJob,
  type CostEstimate,
  type ModelDescriptor,
  type GenerationSpec,
  type RoutingPolicy,
} from "@rocketease/media";
import { db } from "@/db";
import { mediaJob } from "@/db/schema/media";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/jobs/outbox";
import { log } from "@/lib/log";
import { checkCeiling } from "./ceiling";
import { checkVoice } from "./voice/store";
import type { UsageScope } from "./voice/policy";

export type CreateJobInput = {
  organizationId: string;
  workspaceId: string;
  userId: string;
  spec: GenerationSpec;
  policy?: RoutingPolicy;
  /**
   * What the output is for. Only consulted when a voice is involved, where an
   * organic-only consent cannot carry a paid ad. Defaults to the narrower of
   * the two — and the produced asset also inherits the consent's scope, so a
   * wrong answer here is caught again by the rights preflight.
   */
  usage?: UsageScope;
  /**
   * A key the CALLER can reproduce, for work that runs inside a retrying queue.
   *
   * The default is a fresh UUID, which is right when a person pressed a button:
   * two presses are two requests. It is wrong when the caller is a job that
   * retries, because every attempt then mints a new key, creates a new row and
   * spends again — which is exactly what a voice-over did on its first live run
   * (docs/bugs/B-014). Given here, the unique index on (workspace,
   * idempotencyKey) makes the second attempt find the first instead of paying
   * twice.
   */
  idempotencyKey?: string;
};

export type CreateJobResult = { mediaJobId: string; modelKey: string; modelReason: string; estimate: CostEstimate } | { error: string };

const rates = () => parseRates(process.env.AI_MEDIA_RATES_JSON, (m) => log.warn(m));

/** Models this deployment can actually run for a job kind, in registry order. */
export function modelsAvailableFor(jobKind: GenerationSpec["jobKind"], now?: Date) {
  const isConfigured = availabilityFrom(buildRegistry());
  return modelsForJob(jobKind, now).filter((m) => isConfigured(m.adapter));
}

/** Whether to offer the control at all — no configured model means no button. */
export const canGenerate = (jobKind: GenerationSpec["jobKind"]) => modelsAvailableFor(jobKind).length > 0;

/** What a generate button shows before anything is spent. */
export function previewJob(spec: GenerationSpec, policy?: RoutingPolicy) {
  const registry = buildRegistry();
  const routed = routeJob(spec, { policy, isConfigured: availabilityFrom(registry) });
  if (!isRouted(routed)) return { error: routed.error };
  return { model: routed.model, reason: routed.reason, estimate: estimateCost(routed.model, spec, rates()) };
}

export type PreparedJob = { model: ModelDescriptor; reason: string; estimate: CostEstimate; idempotencyKey: string };

/**
 * Everything that can refuse, in the order that costs least. All of it runs
 * before a row exists and long before an adapter is touched, so a refusal leaves
 * no half-state. Shared by the queued path and the inline one.
 */
export async function prepareJob(input: CreateJobInput): Promise<PreparedJob | { error: string }> {
  const preview = previewJob(input.spec, input.policy);
  if ("error" in preview) return { error: preview.error ?? "No model can run this request." };

  // Consent BEFORE spend. A refused voice must never reach a vendor.
  if (input.spec.voiceId) {
    const voice = await checkVoice(input.workspaceId, input.spec.voiceId, input.usage ?? "organic");
    if ("error" in voice) return { error: voice.error };
  }

  const ceiling = await checkCeiling(input.organizationId, preview.estimate);
  if ("error" in ceiling) return { error: ceiling.error };

  // One key per request. Reusing it is what makes a retry safe; minting it here
  // means the vendor sees the same key for every attempt at this job. A caller
  // that is itself retried supplies its own, so its attempts share one.
  return { ...preview, idempotencyKey: input.idempotencyKey ?? `media_${randomUUID()}` };
}

/** The media_job row for a prepared request, in whichever state the caller starts it. */
export function jobValues(input: CreateJobInput, prepared: PreparedJob, state: "queued" | "running") {
  return {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    jobKind: input.spec.jobKind,
    adapter: prepared.model.adapter,
    modelKey: prepared.model.key,
    vendorModelId: prepared.model.vendorModelId,
    modelReason: prepared.reason,
    spec: input.spec as unknown as Record<string, unknown>,
    seed: input.spec.seed ?? null,
    idempotencyKey: prepared.idempotencyKey,
    state,
    requestedByUserId: input.userId,
  };
}

/** Audited the same way whichever path ran it — the spend is what is being recorded. */
export async function auditGeneration(input: CreateJobInput, prepared: PreparedJob, mediaJobId: string) {
  await audit({
    action: "media.generate",
    actorUserId: input.userId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    targetType: "media_job",
    targetId: mediaJobId,
    summary: { after: { jobKind: input.spec.jobKind, model: prepared.model.key, reason: prepared.reason } },
  });
}

/** The queued path: one row and one job, in one transaction, through the outbox. */
export async function enqueueJob(input: CreateJobInput, prepared: PreparedJob): Promise<CreateJobResult> {
  const id = await db.transaction(async (tx) => {
    const [row] = await tx.insert(mediaJob).values(jobValues(input, prepared, "queued")).returning({ id: mediaJob.id });
    await emit(tx, "media.generate", { mediaJobId: row.id }, {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      dedupeKey: `media.generate:${row.id}`,
    });
    return row.id;
  });

  await auditGeneration(input, prepared, id);
  return { mediaJobId: id, modelKey: prepared.model.key, modelReason: prepared.reason, estimate: prepared.estimate };
}

export async function createMediaJob(input: CreateJobInput): Promise<CreateJobResult> {
  const prepared = await prepareJob(input);
  return "error" in prepared ? prepared : enqueueJob(input, prepared);
}
