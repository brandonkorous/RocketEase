/*
 * Turning reference asset ids into the bytes a vendor call needs.
 *
 * Deliberately NOT done when the job is created. `media_job.spec` is stored
 * verbatim as jsonb and is meant to stay replayable and diffable; a PNG encoded
 * into it would bloat every row and make the audit trail unreadable. So the
 * spec carries `{ assetId, role }` and the bytes are fetched here, once, just
 * before the model is called.
 *
 * Both start paths go through this — the worker for queued jobs and the inline
 * runner for synchronous ones — because two copies would drift on exactly the
 * thing that matters: the workspace check.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { GenerationSpec, ModelDescriptor, ReferenceInput } from "@rocketease/media";
import { referenceCapacity } from "@rocketease/media";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import { getObjectBuffer } from "@/lib/storage";
// load.ts, NOT store.ts: store is server-only and this runs in the worker.
import { loadBrandKit } from "@/lib/brand/load";
import { fitReference } from "./reference-fit";

/** The size the model wants for this aspect, or null when it declares none. */
export function targetSize(model: ModelDescriptor, aspect: string | undefined): { width: number; height: number } | null {
  const aspects = model.io.outputs.aspects ?? [];
  const resolutions = model.io.outputs.resolutions ?? [];
  const i = aspects.indexOf(aspect ?? aspects[0]);
  const chosen = resolutions[i === -1 ? 0 : i];
  const m = /^(\d+)x(\d+)$/.exec(chosen ?? "");
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/**
 * Attach bytes to every reference the model can actually take.
 *
 * Never throws: a reference that cannot be loaded is DROPPED, because a missing
 * packshot should degrade the shot rather than fail a job the customer is about
 * to be charged for either way.
 */
export async function hydrateReferences(spec: GenerationSpec, model: ModelDescriptor, workspaceId: string): Promise<GenerationSpec> {
  const wanted = spec.references ?? [];
  const capacity = referenceCapacity(model.io).images;
  if (wanted.length === 0 || capacity === 0) return spec;

  const size = targetSize(model, spec.aspect);
  if (!size) return spec;

  const ids = wanted.map((r) => r.assetId);
  const rows = await db
    .select({ id: asset.id, storageKey: asset.storageKey, mimeType: asset.mimeType, kind: asset.kind, uploadStatus: asset.uploadStatus })
    .from(asset)
    // Workspace-scoped, and NOT deleted. An asset id from another tenant must
    // resolve to nothing rather than to somebody else's product photo.
    .where(and(inArray(asset.id, ids), eq(asset.workspaceId, workspaceId), isNull(asset.deletedAt)));

  const byId = new Map(rows.map((r) => [r.id, r]));
  const pad = (await loadBrandKit(workspaceId).catch(() => null))?.visual?.palette?.[0]?.hex;

  const out: ReferenceInput[] = [];
  for (const ref of wanted) {
    if (out.length >= capacity) break;
    const row = byId.get(ref.assetId);
    if (!row || row.kind !== "image" || row.uploadStatus !== "ready") continue;
    const bytes = await loadFitted(row.storageKey, size, pad);
    if (bytes) out.push({ ...ref, bytes, mimeType: "image/png" });
  }
  return { ...spec, references: out };
}

/** Bytes fitted to the model's frame, or null when storage or sharp says no. */
async function loadFitted(storageKey: string, size: { width: number; height: number }, padHex: string | undefined) {
  try {
    const raw = await getObjectBuffer(storageKey);
    return new Uint8Array(await fitReference({ bytes: raw, width: size.width, height: size.height, padHex }));
  } catch {
    return null;
  }
}
