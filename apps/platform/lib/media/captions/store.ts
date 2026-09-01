/*
 * Caption tracks in the database, and the sidecar in storage.
 *
 * One rule worth stating: WORDS ARE THE SOURCE OF TRUTH. Cues are derived on
 * every read, and the sidecar is regenerated whenever the words change, so an
 * edit can never leave a stale SRT sitting in storage claiming otherwise.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assetRendition } from "@/db/schema/assets";
import { captionTrack, type CaptionSource, type CaptionTrack, type CaptionWord } from "@/db/schema/voice";
import { newObjectKey, putObject } from "@/lib/storage";
import { buildCues, type CueOptions } from "./cues";
import { SIDECAR, type SidecarFormat } from "./formats";

export type UpsertTrackInput = {
  organizationId: string;
  workspaceId: string;
  assetId: string;
  language: string;
  source: CaptionSource;
  words: CaptionWord[];
  text: string;
  mediaJobId?: string | null;
  confidence?: number | null;
  userId?: string | null;
};

/**
 * One track per (asset, language) — the unique index says so. A re-run replaces
 * rather than accumulating, which is what makes a transcription retry safe.
 */
export async function upsertCaptionTrack(input: UpsertTrackInput): Promise<CaptionTrack> {
  const values = {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    assetId: input.assetId,
    language: input.language,
    source: input.source,
    words: input.words,
    text: input.text,
    mediaJobId: input.mediaJobId ?? null,
    confidence: input.confidence ?? null,
    createdByUserId: input.userId ?? null,
  };
  const [row] = await db
    .insert(captionTrack)
    .values(values)
    .onConflictDoUpdate({
      target: [captionTrack.assetId, captionTrack.language],
      set: {
        source: values.source,
        words: values.words,
        text: values.text,
        mediaJobId: values.mediaJobId,
        confidence: values.confidence,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export const findTrack = (assetId: string, language: string) =>
  db.query.captionTrack.findFirst({ where: (t, { and: a, eq: e }) => a(e(t.assetId, assetId), e(t.language, language)) });

export const tracksForAsset = (assetId: string) =>
  db.select().from(captionTrack).where(eq(captionTrack.assetId, assetId));

/**
 * Write the sidecar. Kept for YouTube, accessibility and the archive — Instagram,
 * TikTok and LinkedIn accept no sidecar over their APIs, which is exactly why
 * the pixels carry captions too (docs/research/ai-media-2026.md §10).
 */
export async function writeSidecar(
  track: CaptionTrack,
  format: SidecarFormat = "vtt",
  options?: Partial<CueOptions>,
): Promise<{ storageKey: string; bytes: number }> {
  const spec = SIDECAR[format];
  const body = Buffer.from(spec.render(buildCues(track.words, options)), "utf8");
  const key = newObjectKey(track.organizationId, track.workspaceId, "rendition", `captions-${track.language}${spec.extension}`);
  await putObject(key, body, spec.mimeType);

  await db
    .insert(assetRendition)
    .values({
      assetId: track.assetId,
      kind: "captions",
      storageKey: key,
      mimeType: spec.mimeType,
      bytes: body.byteLength,
    })
    .onConflictDoUpdate({
      target: [assetRendition.assetId, assetRendition.kind],
      set: { storageKey: key, mimeType: spec.mimeType, bytes: body.byteLength },
    });

  return { storageKey: key, bytes: body.byteLength };
}

/** Delete a track and its sidecar rendition together, so neither outlives the other. */
export async function deleteCaptionTrack(trackId: string): Promise<void> {
  const [row] = await db.select().from(captionTrack).where(eq(captionTrack.id, trackId));
  if (!row) return;
  await db.delete(captionTrack).where(eq(captionTrack.id, trackId));
  const remaining = await tracksForAsset(row.assetId);
  if (!remaining.length) {
    await db.delete(assetRendition).where(and(eq(assetRendition.assetId, row.assetId), eq(assetRendition.kind, "captions")));
  }
}
