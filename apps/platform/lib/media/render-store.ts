/*
 * Writing a derived asset into the library, and recording an ad render on its plan.
 *
 * The rule that matters here: a derived asset INHERITS its source's rights
 * envelope. Licence expiry, organic-vs-paid scope and per-network clearance all
 * carry over, because otherwise "render it" — or "caption it" — would be a
 * one-click way to launder an asset out of its own licence.
 *
 * It also inherits the provenance CHAIN, with this step appended. Re-encoding
 * strips C2PA, so that fact is recorded rather than lost (EU AI Act Art. 50).
 */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { asset, type Asset, type AssetKind, type AssetProvenance } from "@/db/schema/assets";
import { credentialForDerived } from "./c2pa";
import type { MergedRights } from "./rights-merge";
import { contentItem } from "@/db/schema/content";
import { emit } from "@/lib/jobs/outbox";
import { newObjectKey, putObject } from "@/lib/storage";
import type { AdPlan, RenderRecord } from "./plan/types";
import type { RenderResult } from "./compose/render";

export type RenderActor = { organizationId: string; workspaceId: string; userId: string | null };

/**
 * Re-encoding strips content credentials — but whether THIS output lost one is a
 * question about the bytes, not an assumption. Say which, rather than losing it
 * quietly (EU AI Act Art. 50).
 */
function provenanceFor(base: Asset | null, bytes: Buffer, steps: string[]): AssetProvenance {
  const prior = base?.provenance;
  return {
    c2pa: credentialForDerived(bytes, prior?.c2pa),
    watermark: prior?.watermark ?? null,
    chain: [...(prior?.chain ?? []), ...steps.map((action) => ({ action }))],
  };
}

export type WriteDerivedInput = {
  actor: RenderActor;
  /** What this was made from. Null means it was made from nothing but the brand kit. */
  base: Asset | null;
  bytes: Buffer;
  mimeType: string;
  kind?: AssetKind;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  fileName: string;
  altText: string | null;
  /** What happened, appended to the provenance chain. */
  action: string;
  extraChain?: string[];
  /**
   * Explicit rights for something made from SEVERAL sources. Without it the
   * envelope is inherited from `base`, which is right for a one-to-one derive
   * and wrong for an assembly — see lib/media/rights-merge.ts.
   */
  rights?: MergedRights;
};

/** One asset per render, queued for processing through the same door as an upload. */
export async function writeDerivedAsset(input: WriteDerivedInput): Promise<string> {
  const { actor, base } = input;
  const key = newObjectKey(actor.organizationId, actor.workspaceId, "original", input.fileName);
  await putObject(key, input.bytes, input.mimeType);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(asset)
      .values({
        organizationId: actor.organizationId,
        workspaceId: actor.workspaceId,
        kind: input.kind ?? (input.mimeType.startsWith("video/") ? "video" : input.mimeType.startsWith("audio/") ? "audio" : "image"),
        storageKey: key,
        fileName: input.fileName,
        mimeType: input.mimeType,
        bytes: input.bytes.byteLength,
        width: input.width ?? null,
        height: input.height ?? null,
        durationSeconds: input.durationSeconds ?? base?.durationSeconds ?? null,
        checksumSha256: createHash("sha256").update(input.bytes).digest("hex"),
        title: input.fileName.replace(/\.[^.]+$/, ""),
        altText: input.altText,
        uploadStatus: "processing",
        // A composite of a generated image is still a generated image.
        generatedByAi: base?.generatedByAi ?? false,
        generationModel: base?.generationModel ?? null,
        mediaJobId: base?.mediaJobId ?? null,
        derivedFromAssetId: base?.id ?? null,
        provenance: provenanceFor(base, input.bytes, [input.action, ...(input.extraChain ?? [])]),
        // Inherited, never reset — see the file comment.
        licenseSource: input.rights?.licenseSource ?? base?.licenseSource ?? "owned",
        rightsScope: input.rights?.rightsScope ?? base?.rightsScope ?? "both",
        rightsExpiresAt: input.rights?.rightsExpiresAt ?? base?.rightsExpiresAt ?? null,
        rightsNote: base?.rightsNote ?? null,
        platformClearance: input.rights?.platformClearance ?? base?.platformClearance ?? {},
        uploadedByUserId: actor.userId,
      })
      .returning({ id: asset.id });
    await emit(tx, "asset.process", { assetId: row.id }, {
      organizationId: actor.organizationId,
      workspaceId: actor.workspaceId,
      dedupeKey: `asset.process:${row.id}`,
    });
    return row.id;
  });
}

export type WriteCompositeInput = {
  actor: RenderActor;
  base: Asset | null;
  result: RenderResult;
  fileName: string;
  altText: string | null;
};

/** An ad composite: the same derived write, plus what the renderer reported. */
export async function writeCompositeAsset(input: WriteCompositeInput): Promise<string> {
  const substituted = [...new Set(input.result.fonts.filter((f) => f.substituted).map((f) => f.requested))];
  return writeDerivedAsset({
    actor: input.actor,
    base: input.base,
    bytes: input.result.bytes,
    mimeType: input.result.mimeType,
    kind: "image",
    width: input.result.size.width,
    height: input.result.size.height,
    durationSeconds: null,
    fileName: input.fileName,
    altText: input.altText,
    action: "type composited from the brand kit",
    extraChain: substituted.length ? [`fonts substituted: ${substituted.join(", ")}`] : [],
  });
}

/** Replace the record for this (placement, variant), leaving every other alone. */
export function withRender(plan: AdPlan, record: RenderRecord): AdPlan {
  const others = plan.renders.filter((r) => !(r.placement === record.placement && r.variantId === record.variantId));
  return { ...plan, renders: [...others, record] };
}

export async function savePlan(contentItemId: string, plan: AdPlan): Promise<void> {
  await db.update(contentItem).set({ adPlan: plan, updatedAt: new Date() }).where(eq(contentItem.id, contentItemId));
}
