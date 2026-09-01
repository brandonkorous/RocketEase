/*
 * Turning a finished vendor job into assets — the ONLY place that does it.
 *
 * Both callers land here: the worker's poller for vendors that take minutes,
 * and the inline runner for vendors that answer in one call. Two copies of this
 * would drift on exactly the details that matter — provenance, rights scope and
 * what we record as having been charged.
 */
import { eq } from "drizzle-orm";
import { MEDIA_KIND_OF, type JobKind, type MediaAdapter, type MediaJobState as VendorState, type MediaKind, type ModelDescriptor } from "@rocketease/media";
import { db } from "@/db";
import { log } from "@/lib/log";
import { mediaJob, type MediaJob } from "@/db/schema/media";
import type { AiUsageKind } from "@/db/schema/ai-usage";
import { creditsToColumn } from "@/lib/ai/usage/credits";
import { recordAiUsage } from "@/lib/ai/usage/record";
import { normalizeOutputs } from "./normalize";
import { loadVoice, rightsScopeForVoice } from "./voice/store";

export type FinishResult = { assetIds: string[]; mismatches: string[] };

/** Images today; a video kind earns its own line when video ships. */
const USAGE_KIND: Partial<Record<MediaKind, AiUsageKind>> = { image: "generate_image" };

/**
 * Charge the customer in credits, from the tokens the vendor metered.
 *
 * Null when the vendor reported no tokens: a job we cannot measure is not a job
 * we may invent a charge for. The cost is passed rather than derived, because
 * AI_PRICES_JSON prices text deployments and knows nothing about image models.
 */
async function chargeCredits(row: MediaJob, state: VendorState) {
  const tokens = state.usage?.tokens;
  const kind = USAGE_KIND[MEDIA_KIND_OF[row.jobKind as JobKind]];
  if (!tokens || !kind) return null;
  return recordAiUsage({
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    userId: row.requestedByUserId,
    kind,
    model: row.modelKey,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    costUsd: state.usage?.costUsd ?? null,
  });
}

/**
 * A voice-over inherits its consent's scope, so organic-only consent produces an
 * organic-only asset and the rights preflight blocks it from an ad. Read now
 * rather than copied onto the job, so a consent narrowed mid-flight is honoured.
 */
export async function scopeForJob(row: Pick<MediaJob, "workspaceId" | "spec">) {
  const voiceId = (row.spec as { voiceId?: string } | null)?.voiceId;
  if (!voiceId) return undefined;
  const voice = await loadVoice(row.workspaceId, voiceId);
  return voice ? rightsScopeForVoice(voice) : undefined;
}

/** Fetch the bytes, store them, and record what the vendor says it charged. */
export async function completeMediaJob(
  row: MediaJob,
  model: ModelDescriptor,
  adapter: MediaAdapter,
  state: VendorState,
): Promise<FinishResult> {
  const outputs = await adapter.fetch(state);
  /*
   * Metered in the SAME ledger and the SAME formula as drafting, so one credit
   * means one thing across the product. Generation was previously free to the
   * customer and pure cost to us (docs/bugs/B-004).
   */
  const billed = await chargeCredits(row, state);
  const { assetIds, mismatches } = await normalizeOutputs({
    actor: { organizationId: row.organizationId, workspaceId: row.workspaceId, userId: row.requestedByUserId },
    mediaJobId: row.id,
    modelKey: row.modelKey,
    outputs,
    provenance: {
      // The CLAIM. normalizeOutputs probes the bytes and records any disagreement;
      // our own render may strip it later, and that is recorded then, so the
      // chain never silently loses a credential.
      claimsC2pa: model.provenance.c2pa,
      watermark: model.provenance.watermark,
      chain: [{ action: "generated", adapter: row.adapter, model: row.modelKey }],
    },
    altText: (row.spec as { altText?: string } | null)?.altText ?? null,
    rightsScope: await scopeForJob(row),
  });

  await db
    .update(mediaJob)
    .set({
      state: "succeeded",
      assetIds,
      mismatches,
      quantity: state.usage ? String(state.usage.quantity) : null,
      unit: state.usage?.unit ?? null,
      inputTokens: state.usage?.tokens?.inputTokens ?? null,
      outputTokens: state.usage?.tokens?.outputTokens ?? null,
      // Null when the vendor says nothing — never a guessed 0.
      vendorCostUsd: state.usage?.costUsd === undefined ? null : String(state.usage.costUsd),
      credits: billed === null ? null : creditsToColumn(billed.credits),
      outputExpiresAt: state.expiresAt ? new Date(state.expiresAt) : null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(mediaJob.id, row.id));

  /*
   * Spend has to be READABLE, not merely recorded. vendor_cost_usd is what the
   * monthly ceiling accrues against, and until this line the only way to see it
   * was to run a psql Job against production — so an api-version that quietly
   * stopped returning `usage` would disarm the ceiling with nothing to notice.
   * A null cost is logged as unknown rather than omitted, because that is the
   * case worth spotting.
   */
  log.info("media job charged", {
    mediaJobId: row.id,
    adapter: row.adapter,
    model: row.modelKey,
    quantity: state.usage?.quantity ?? null,
    unit: state.usage?.unit ?? null,
    costUsd: state.usage?.costUsd ?? "unknown",
    credits: billed?.credits ?? "unbilled",
    assets: assetIds.length,
  });

  return { assetIds, mismatches };
}

/** The one terminal write for a job that did not produce assets. */
export async function endMediaJob(
  id: string,
  opts: { state?: "failed" | "cancelled"; category: string; note: string; detail?: string },
) {
  await db
    .update(mediaJob)
    .set({
      state: opts.state ?? "failed",
      errorCategory: opts.category,
      errorNote: opts.note,
      finishedAt: new Date(),
      updatedAt: new Date(),
      ...(opts.detail ? { mismatches: [opts.detail] } : {}),
    })
    .where(eq(mediaJob.id, id));
}
