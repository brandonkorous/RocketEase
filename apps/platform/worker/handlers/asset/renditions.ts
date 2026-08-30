/*
 * Writing a rendition. One place, so image, video poster and waveform all enter
 * storage and the database the same way.
 */
import { db } from "@/db";
import { assetRendition, type RenditionKind } from "@/db/schema/assets";
import { newObjectKey, putObject } from "@/lib/storage";

export type RenditionInput = {
  organizationId: string;
  workspaceId: string;
  assetId: string;
  kind: RenditionKind;
  bytes: Buffer;
  mimeType: string;
  extension: string;
  width?: number | null;
  height?: number | null;
};

/** Upsert on (assetId, kind): reprocessing replaces rather than duplicates. */
export async function writeRendition(input: RenditionInput): Promise<void> {
  const key = newObjectKey(input.organizationId, input.workspaceId, "rendition", `${input.kind}${input.extension}`);
  await putObject(key, input.bytes, input.mimeType);
  const values = {
    assetId: input.assetId,
    kind: input.kind,
    storageKey: key,
    mimeType: input.mimeType,
    width: input.width ?? null,
    height: input.height ?? null,
    bytes: input.bytes.byteLength,
  };
  await db
    .insert(assetRendition)
    .values(values)
    .onConflictDoUpdate({
      target: [assetRendition.assetId, assetRendition.kind],
      set: { storageKey: key, mimeType: input.mimeType, width: values.width, height: values.height, bytes: values.bytes },
    });
}
