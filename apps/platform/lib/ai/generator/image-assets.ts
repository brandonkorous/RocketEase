/*
 * Generated images enter the library through the same door as an upload:
 * object storage → asset row → asset.process (renditions + scan hook). They
 * are flagged as AI-generated so the composer can suggest the synthetic-media
 * disclosure instead of leaving it to the author to remember.
 */
import "server-only";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/jobs/outbox";
import { newObjectKey, putObject } from "@/lib/storage";
import { imageModel, imagesConfigured, renderImages, type GeneratedImage, type ImageGenerator, type ImageOptions } from "./images";

export type ImageActor = { organizationId: string; workspaceId: string; userId: string };

const fileName = (extension: string, i: number) => `ai-image-${new Date().toISOString().slice(0, 10)}-${i + 1}${extension}`;

/** One asset row per image, each queued for processing exactly like an upload. */
async function store(actor: ImageActor, images: GeneratedImage[], altText: string | null): Promise<string[]> {
  const ids: string[] = [];
  for (const [i, img] of images.entries()) {
    const name = fileName(img.extension, i);
    const key = newObjectKey(actor.organizationId, actor.workspaceId, "original", name);
    await putObject(key, img.bytes, img.mimeType);
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(asset)
        .values({
          organizationId: actor.organizationId,
          workspaceId: actor.workspaceId,
          kind: "image",
          storageKey: key,
          fileName: name,
          mimeType: img.mimeType,
          bytes: img.bytes.byteLength,
          title: name.replace(/\.[^.]+$/, ""),
          altText,
          uploadStatus: "processing",
          generatedByAi: true,
          generationModel: imageModel(),
          uploadedByUserId: actor.userId,
        })
        .returning({ id: asset.id });
      await emit(tx, "asset.process", { assetId: row.id }, { organizationId: actor.organizationId, workspaceId: actor.workspaceId, dedupeKey: `asset.process:${row.id}` });
      return row.id;
    });
    ids.push(id);
    await audit({
      action: "asset.upload",
      actorUserId: actor.userId,
      organizationId: actor.organizationId,
      workspaceId: actor.workspaceId,
      targetType: "asset",
      targetId: id,
      summary: { after: { fileName: name, kind: "image", bytes: img.bytes.byteLength, generatedByAi: true, model: imageModel() } },
    });
  }
  return ids;
}

/** null when unconfigured — callers hide the button rather than offering a dead one. */
export function imageGeneratorFor(actor: ImageActor, altText: string | null = null): ImageGenerator | null {
  if (!imagesConfigured()) return null;
  return {
    model: imageModel(),
    async generate(prompt: string, opts: ImageOptions) {
      const rendered = await renderImages(prompt, opts);
      if ("error" in rendered) return { error: rendered.error };
      return { assetIds: await store(actor, rendered.images, altText) };
    },
  };
}
