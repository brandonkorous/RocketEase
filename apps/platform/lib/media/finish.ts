/*
 * Turning a finished vendor job into assets — the ONLY place that does it.
 *
 * Both callers land here: the worker's poller for vendors that take minutes,
 * and the inline runner for vendors that answer in one call. Two copies of this
 * would drift on exactly the details that matter — provenance, rights scope and
 * what we record as having been charged.
 */
import { eq } from "drizzle-orm";
import type { MediaAdapter, MediaJobState as VendorState, ModelDescriptor } from "@rocketease/media";
import { db } from "@/db";
import { mediaJob, type MediaJob } from "@/db/schema/media";
import { normalizeOutputs } from "./normalize";
import { loadVoice, rightsScopeForVoice } from "./voice/store";

export type FinishResult = { assetIds: string[]; mismatches: string[] };

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
      // Null when the vendor says nothing — never a guessed 0.
      vendorCostUsd: state.usage?.costUsd === undefined ? null : String(state.usage.costUsd),
      outputExpiresAt: state.expiresAt ? new Date(state.expiresAt) : null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(mediaJob.id, row.id));

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
