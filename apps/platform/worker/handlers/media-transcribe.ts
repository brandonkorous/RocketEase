/*
 * Speech to text for one asset → a caption_track with word timings.
 *
 * Transcription spends money — pennies per clip, not dollars, but money — so it
 * follows the same shape as every other spend here, adapted to the fact that
 * the RESULT LANDS IN OUR OWN DATABASE. That makes reconciliation local: before
 * calling a vendor we check whether a generated track already exists for this
 * (asset, language). A retry after a lost response costs nothing.
 *
 * `force` exists for the one case that check would otherwise block: a person
 * deliberately re-running a transcription they were not happy with.
 */
import { eq } from "drizzle-orm";
import { buildRegistry } from "@rocketease/media";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import type { JobPayloads } from "@/lib/jobs/queues";
import { findTrack, upsertCaptionTrack, writeSidecar } from "@/lib/media/captions/store";
import { getObjectBuffer } from "@/lib/storage";
import type { HandlerContext } from "./index";

const TRANSCRIBABLE = new Set(["audio", "video"]);
// azure-speech first: it is the one actually deployed. elevenlabs stays ahead
// of mock so a real vendor always beats the fixture if one is ever configured.
const ADAPTER_ORDER = ["azure-speech", "elevenlabs", "mock"];

/** The first configured adapter that actually does speech to text. */
function transcriber() {
  const registry = buildRegistry();
  for (const key of ADAPTER_ORDER) {
    const adapter = registry.get(key);
    if (adapter?.configured() && adapter.transcribe) return adapter;
  }
  return null;
}

export async function mediaTranscribe(data: JobPayloads["media.transcribe"], ctx: HandlerContext) {
  const language = data.language ?? "en";
  const l = ctx.log.child({ assetId: data.assetId, language });

  const [row] = await db.select().from(asset).where(eq(asset.id, data.assetId));
  if (!row || row.deletedAt) return;
  if (!TRANSCRIBABLE.has(row.kind)) {
    l.warn("nothing to transcribe", { kind: row.kind });
    return;
  }

  // Local reconciliation: our own row is the record of what we already paid for.
  if (!data.force) {
    const existing = await findTrack(data.assetId, language);
    if (existing && existing.source === "generated") {
      l.info("caption track already exists; not re-spending", { trackId: existing.id });
      return;
    }
  }

  const adapter = transcriber();
  if (!adapter?.transcribe) {
    l.warn("no configured adapter does speech to text; captions not generated");
    return;
  }

  const bytes = await getObjectBuffer(row.storageKey);
  const transcript = await adapter.transcribe({
    bytes,
    mimeType: row.mimeType,
    language: data.language,
    diarize: true,
    // Probed, never guessed. An unknown duration stays undefined so the adapter
    // can say what it assumed rather than us inventing a number.
    durationSeconds: row.durationSeconds ?? undefined,
    idempotencyKey: `transcribe:${row.id}:${language}`,
  });

  if (!transcript.words.length) {
    l.warn("transcript came back with no words; nothing written");
    return;
  }

  const track = await upsertCaptionTrack({
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    assetId: row.id,
    // What the vendor DETECTED wins over what we asked for.
    language: transcript.language || language,
    source: "generated",
    words: transcript.words,
    text: transcript.text,
    confidence: transcript.confidence ?? null,
  });

  const sidecar = await writeSidecar(track);
  l.info("captions generated", {
    trackId: track.id,
    words: transcript.words.length,
    language: track.language,
    confidence: transcript.confidence,
    sidecarBytes: sidecar.bytes,
  });
  // Nothing burns in automatically. Burning captions into pixels is a creative
  // decision with a style attached, so a person asks for it.
}
