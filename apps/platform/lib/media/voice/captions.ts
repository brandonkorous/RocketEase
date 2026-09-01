/*
 * Turning a voice-over into cues, in the brand's own colours.
 *
 * The words come from transcribing the VOICE, not the finished mix: cleaner
 * audio to align against, and no risk of a lake being heard as a word.
 *
 * Style is derived from the placement's safe zone (so captions clear the Reels
 * chrome by construction) and then tinted from the brand kit. Only the colours
 * are the brand's — size and margins stay geometric, because a brand cannot
 * make text legible by wanting it to be.
 */
import type { AdapterRegistry } from "@rocketease/media";
import { CANVAS_SPECS, type CanvasSpec } from "../canvas/specs";
import { buildCues, type Cue } from "../captions/cues";
import { styleForPlacement, type CaptionStyle } from "../captions/ass";
import { loadBrandKit } from "@/lib/brand/load";
import { log } from "@/lib/log";
import type { CaptionWord } from "@/db/schema/voice";

/** The transcriber we actually deploy, ahead of the fixture. */
const ADAPTER_ORDER = ["azure-speech", "elevenlabs", "mock"];

export type CaptionResult = { cues: Cue[]; style: CaptionStyle; words: CaptionWord[]; language: string };

/**
 * The frame captions must sit inside.
 *
 * Portrait borrows the Reels spec, because its safe zone is the aggressive one
 * — clear that and you clear everything. There is no published landscape spec
 * here, so rather than borrow a portrait one and compute margins against the
 * wrong height, landscape gets the clip's real dimensions and a plainly stated
 * unverified inset.
 */
export function canvasFor(width: number | null, height: number | null): CanvasSpec {
  const portrait = (height ?? 1) >= (width ?? 0);
  if (portrait) return CANVAS_SPECS.meta_reels_9x16;
  return {
    ...CANVAS_SPECS.meta_reels_9x16,
    label: "Landscape clip",
    width: width ?? 1280,
    height: height ?? 720,
    // Landscape carries no platform chrome over the picture, so this is
    // typographic breathing room rather than a published safe area.
    safeZone: { top: 0.08, bottom: 0.1, left: 0.06, right: 0.06 },
    safeZoneVerified: false,
    safeZoneNote: "No published landscape safe area; a conservative inset.",
  };
}

type Input = {
  bytes: Buffer;
  mimeType: string;
  source: { width: number | null; height: number | null };
  registry: AdapterRegistry;
  workspaceId: string;
};

/**
 * Cues, or null when nothing can transcribe — never a caption of guessed timings.
 *
 * A transcription failure DEGRADES rather than fails: captions are the optional
 * half, and losing a paid-for voice-over because whisper was rate-limited would
 * throw away the valuable part to protect the decoration. whisper here is
 * 1 request per minute, so that is a real case and not a theoretical one.
 */
export async function captionsFor(input: Input): Promise<CaptionResult | null> {
  const adapter = ADAPTER_ORDER.map((k) => input.registry.get(k)).find((a) => a?.configured() && a.transcribe);
  if (!adapter?.transcribe) return null;

  let t: Awaited<ReturnType<NonNullable<typeof adapter.transcribe>>>;
  try {
    t = await adapter.transcribe({ bytes: input.bytes, mimeType: input.mimeType, idempotencyKey: `vo:${input.workspaceId}:${input.bytes.byteLength}` });
  } catch (err) {
    log.warn("captions skipped; the voice-over is kept", { err });
    return null;
  }
  const words: CaptionWord[] = t.words.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs }));
  if (words.length === 0) return null;

  const spec = canvasFor(input.source.width, input.source.height);
  const kit = await loadBrandKit(input.workspaceId).catch(() => null);
  return { cues: buildCues(words), style: brandStyle(spec, kit), words, language: t.language };
}

/** Text in the brand's ink over its own outline, sized by the frame. */
function brandStyle(spec: CanvasSpec, kit: Awaited<ReturnType<typeof loadBrandKit>> | null): CaptionStyle {
  const palette = (kit?.visual?.palette ?? []).map((p) => p.hex).filter(Boolean) as string[];
  // A brand's FIRST colour is its loudest, which is right for the outline and
  // wrong for body text. White on brand reads on any footage; brand-on-white
  // disappears the moment the shot goes pale.
  const outline = palette[0];
  return styleForPlacement(spec, {
    ...(outline ? { outlineHex: outline } : {}),
    fontFamily: kit?.visual?.typography?.headingFamily || "",
  });
}
