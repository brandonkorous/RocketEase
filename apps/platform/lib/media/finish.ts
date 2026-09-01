/*
 * Turning a finished vendor job into assets — the ONLY place that does it.
 *
 * Both callers land here: the worker's poller for vendors that take minutes,
 * and the inline runner for vendors that answer in one call. Two copies of this
 * would drift on exactly the details that matter — provenance, rights scope and
 * what we record as having been charged.
 */
import { eq } from "drizzle-orm";
import { MEDIA_KIND_OF, parseRates, type JobKind, type MediaAdapter, type MediaJobState as VendorState, type MediaKind, type ModelDescriptor } from "@rocketease/media";
import { db } from "@/db";
import { log } from "@/lib/log";
import { mediaJob, type MediaJob } from "@/db/schema/media";
import type { AiUsageKind } from "@/db/schema/ai-usage";
import { creditsToColumn } from "@/lib/ai/usage/credits";
import { recordAiUsage } from "@/lib/ai/usage/record";
import { creditsForQuantity, parseCreditRates } from "./credit-rates";
import { vendorCostUsd } from "./vendor-cost";
import { normalizeOutputs } from "./normalize";
import { loadVoice, rightsScopeForVoice } from "./voice/store";
import { emit } from "@/lib/jobs/outbox";

export type FinishResult = { assetIds: string[]; mismatches: string[] };

const creditRates = () => parseCreditRates(process.env.AI_MEDIA_CREDIT_RATES_JSON, (m) => log.warn(m));
const vendorRates = () => parseRates(process.env.AI_MEDIA_RATES_JSON, (m) => log.warn(m));

// Audio included: without it a voice-over is generated, charged to US, and
// billed to the customer as nothing at all.
const USAGE_KIND: Partial<Record<MediaKind, AiUsageKind>> = { image: "generate_image", video: "generate_video", audio: "generate_voice" };

/**
 * Charge the customer in credits.
 *
 * Two bases, because two vendors measure differently. An image model reports
 * TOKENS, so the product's own credit formula applies unchanged. Sora reports
 * no usage at all — only the seconds we asked for — so those bill through a
 * configured credits-per-second rate instead.
 *
 * Null either way when there is nothing to measure: a job we cannot measure is
 * not a job we may invent a charge for. Cost is passed rather than derived,
 * because AI_PRICES_JSON prices text deployments and knows nothing about these.
 */
async function chargeCredits(row: MediaJob, state: VendorState) {
  const kind = USAGE_KIND[MEDIA_KIND_OF[row.jobKind as JobKind]];
  if (!kind || !state.usage) return null;
  const tokens = state.usage.tokens;
  const perUnit = tokens ? null : creditsForQuantity(row.modelKey, state.usage.quantity, creditRates());
  if (!tokens && perUnit === null) return null;

  return recordAiUsage({
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    userId: row.requestedByUserId,
    kind,
    model: row.modelKey,
    inputTokens: tokens?.inputTokens ?? 0,
    outputTokens: tokens?.outputTokens ?? 0,
    credits: perUnit ?? undefined,
    costUsd: state.usage.costUsd ?? null,
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
   * Metered in the SAME ledger as drafting, so one credit means one thing
   * across the product. Generation was previously free to the customer and pure
   * cost to us (docs/bugs/B-004).
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

  const cost = vendorCostUsd(state.usage?.costUsd, state.usage?.quantity, vendorRates()[row.modelKey]);

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
      // Null when it cannot be known — never a guessed 0. Sora reports no
      // dollars at all, so this is seconds-reported x configured rate.
      vendorCostUsd: cost === null ? null : String(cost),
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
    costUsd: cost ?? "unknown",
    credits: billed?.credits ?? "unbilled",
    assets: assetIds.length,
  });

  await chainVoiceover(row, assetIds);
  return { assetIds, mismatches };
}

/**
 * A clip that was asked for WITH a voice queues the voice-over now that the
 * picture exists.
 *
 * Chained rather than done here: this function runs inside the poller and must
 * stay fast, and the voice-over is ffmpeg work that belongs on the media role.
 * The spec is the record of what was asked for, so a replay of the same job
 * asks for the same thing.
 */
async function chainVoiceover(row: MediaJob, assetIds: string[]) {
  const spec = row.spec as { voiceScript?: string; voiceId?: string; captions?: boolean };
  const script = spec.voiceScript?.trim();
  if (!script || assetIds.length === 0 || !row.requestedByUserId) return;
  if (MEDIA_KIND_OF[row.jobKind as JobKind] !== "video") return;

  await db.transaction(async (tx) => {
    await emit(
      tx,
      "media.render",
      { kind: "voiceover", assetId: assetIds[0], userId: row.requestedByUserId!, script, voiceId: spec.voiceId, captions: spec.captions === true },
      { organizationId: row.organizationId, workspaceId: row.workspaceId, dedupeKey: `media.render:voiceover:${assetIds[0]}` },
    );
  });
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
