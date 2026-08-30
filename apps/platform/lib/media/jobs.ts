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
  type CostEstimate,
  type GenerationSpec,
  type RoutingPolicy,
} from "@rocketease/media";
import { db } from "@/db";
import { mediaJob } from "@/db/schema/media";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/jobs/outbox";
import { log } from "@/lib/log";
import { checkCeiling } from "./ceiling";

export type CreateJobInput = {
  organizationId: string;
  workspaceId: string;
  userId: string;
  spec: GenerationSpec;
  policy?: RoutingPolicy;
};

export type CreateJobResult = { mediaJobId: string; modelKey: string; modelReason: string; estimate: CostEstimate } | { error: string };

const rates = () => parseRates(process.env.AI_MEDIA_RATES_JSON, (m) => log.warn(m));

/** What a generate button shows before anything is spent. */
export function previewJob(spec: GenerationSpec, policy?: RoutingPolicy) {
  const registry = buildRegistry();
  const routed = routeJob(spec, { policy, isConfigured: availabilityFrom(registry) });
  if (!isRouted(routed)) return { error: routed.error };
  return { model: routed.model, reason: routed.reason, estimate: estimateCost(routed.model, spec, rates()) };
}

export async function createMediaJob(input: CreateJobInput): Promise<CreateJobResult> {
  const preview = previewJob(input.spec, input.policy);
  if ("error" in preview) return { error: preview.error ?? "No model can run this request." };

  const ceiling = await checkCeiling(input.organizationId, preview.estimate);
  if ("error" in ceiling) return { error: ceiling.error };

  // One key per request. Reusing it is what makes a retry safe; generating it
  // here means the vendor sees the same key for every attempt at this job.
  const idempotencyKey = `media_${randomUUID()}`;

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(mediaJob)
      .values({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        jobKind: input.spec.jobKind,
        adapter: preview.model.adapter,
        modelKey: preview.model.key,
        vendorModelId: preview.model.vendorModelId,
        modelReason: preview.reason,
        spec: input.spec as unknown as Record<string, unknown>,
        seed: input.spec.seed ?? null,
        idempotencyKey,
        state: "queued",
        requestedByUserId: input.userId,
      })
      .returning({ id: mediaJob.id });
    await emit(tx, "media.generate", { mediaJobId: row.id }, {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      dedupeKey: `media.generate:${row.id}`,
    });
    return row.id;
  });

  await audit({
    action: "media.generate",
    actorUserId: input.userId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    targetType: "media_job",
    targetId: id,
    summary: { after: { jobKind: input.spec.jobKind, model: preview.model.key, reason: preview.reason } },
  });

  return { mediaJobId: id, modelKey: preview.model.key, modelReason: preview.reason, estimate: preview.estimate };
}
