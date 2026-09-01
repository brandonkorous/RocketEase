/*
 * Writing a rendition. One place, so image, video poster and waveform all enter
 * storage and the database the same way.
 */
import { db } from "@/db";
import { assetRendition, type AssetProvenance, type RenditionKind } from "@/db/schema/assets";
import { credentialForDerived } from "@/lib/media/c2pa";
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
  /** The source's credential state, so a manifest we drop is recorded as dropped. */
  sourceCredential?: AssetProvenance["c2pa"] | null;
};

/** Upsert on (assetId, kind): reprocessing replaces rather than duplicates. */
export async function writeRendition(input: RenditionInput): Promise<void> {
  const key = newObjectKey(input.organizationId, input.workspaceId, "rendition", `${input.kind}${input.extension}`);
  await putObject(key, input.bytes, input.mimeType);
  // Probed, not assumed: an encoder that starts preserving manifests should show up
  // here as `signed` without anyone remembering to change this.
  const credential = credentialForDerived(input.bytes, input.sourceCredential ?? undefined);
  const values = {
    assetId: input.assetId,
    kind: input.kind,
    storageKey: key,
    mimeType: input.mimeType,
    width: input.width ?? null,
    height: input.height ?? null,
    bytes: input.bytes.byteLength,
    credential,
  };
  await db
    .insert(assetRendition)
    .values(values)
    .onConflictDoUpdate({
      target: [assetRendition.assetId, assetRendition.kind],
      set: { storageKey: key, mimeType: input.mimeType, width: values.width, height: values.height, bytes: values.bytes, credential },
    });
}
