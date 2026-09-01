/*
 * Assemble one plan variant for one placement into a video asset.
 *
 * This is 12.2's compositor and 12.3's captions doing their jobs over moving
 * pictures rather than a still: the SAME resolved render spec produces the type
 * overlay, and the SAME safe zone sets the caption margin. A headline cannot
 * land in one place on a still and another on a video, because there is only
 * one piece of code deciding.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { asset, type Asset } from "@/db/schema/assets";
import { captionTrack } from "@/db/schema/voice";
import { contentItem } from "@/db/schema/content";
import { loadBrandKit } from "@/lib/brand/load";
import { isPlacement, specFor } from "@/lib/media/canvas/specs";
import { styleForPlacement } from "@/lib/media/captions/ass";
import { toAss } from "@/lib/media/captions/ass";
import { buildCues } from "@/lib/media/captions/cues";
import { fingerprint } from "@/lib/media/compose/fingerprint";
import { renderOverlayLayer } from "@/lib/media/compose/render";
import { resolveRenderSpec } from "@/lib/media/compose/spec";
import { swatch } from "@/lib/media/compose/spec";
import { readPlan } from "@/lib/media/plan/schema";
import { variantById } from "@/lib/media/plan/variants";
import { getObjectBuffer } from "@/lib/storage";
import { describeNarrowing, mergeRights } from "./rights-merge";
import { savePlan, withRender, writeDerivedAsset } from "./render-store";
import { assembleVideo, type ClipBytes } from "./video/assemble";
import { buildAssemblySpec, durationIssues } from "./video/spec";

export type AssemblyInput = { contentItemId: string; placement: string; variantId: string };
export type AssemblyResult = { assetId: string; notes: string[] } | { error: string };

const extensionOf = (a: Asset) => /\.[a-z0-9]{2,5}$/i.exec(a.fileName)?.[0]?.toLowerCase() ?? ".mp4";

/** Workspace-scoped: a plan is jsonb and can name any asset id at all. */
async function loadAssets(workspaceId: string, ids: string[]): Promise<Map<string, Asset>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select()
    .from(asset)
    .where(and(eq(asset.workspaceId, workspaceId), inArray(asset.id, ids), isNull(asset.deletedAt)));
  return new Map(rows.map((r) => [r.id, r]));
}

const fetchClip = async (a: Asset | undefined): Promise<ClipBytes | undefined> => {
  if (!a) return undefined;
  try {
    return { bytes: await getObjectBuffer(a.storageKey), extension: extensionOf(a) };
  } catch {
    return undefined;
  }
};

/** Captions come from whatever is being SAID — the voice-over, when there is one. */
async function captionsFor(workspaceId: string, voiceoverAssetId: string | undefined, language: string, spec: ReturnType<typeof specFor>, bodyFamily: string, textHex: string, outlineHex: string) {
  if (!voiceoverAssetId) return undefined;
  const [track] = await db
    .select()
    .from(captionTrack)
    .where(and(eq(captionTrack.assetId, voiceoverAssetId), eq(captionTrack.workspaceId, workspaceId), eq(captionTrack.language, language)));
  if (!track) return undefined;
  const cues = buildCues(track.words);
  if (!cues.length) return undefined;
  const style = styleForPlacement(spec, { fontFamily: bodyFamily, textHex, outlineHex });
  return toAss({ cues, style, width: spec.width, height: spec.height });
}

export async function assemblePlanVariant(input: AssemblyInput): Promise<AssemblyResult> {
  if (!isPlacement(input.placement)) return { error: `Unknown placement “${input.placement}”.` };

  const [item] = await db.select().from(contentItem).where(eq(contentItem.id, input.contentItemId));
  if (!item) return { error: "That draft no longer exists." };
  const plan = readPlan(item.adPlan);
  if (!plan) return { error: "This draft has no ad plan, or the stored plan could not be read." };
  const variant = variantById(plan, input.variantId);
  if (!variant) return { error: `This plan has no variant “${input.variantId}”.` };
  if (variant.inert) return { error: `“${variant.label}” would render the same as the base, because ${variant.inert}.` };

  const canvas = specFor(input.placement);
  const kit = await loadBrandKit(item.workspaceId);
  const audio = plan.audio;

  const ids = [
    ...variant.shots.flatMap((s) => (s.assetId ? [s.assetId] : [])),
    ...(audio?.voiceoverAssetId ? [audio.voiceoverAssetId] : []),
    ...(audio?.musicAssetId ? [audio.musicAssetId] : []),
  ];
  const assets = await loadAssets(item.workspaceId, ids);

  const spec = buildAssemblySpec({
    shots: variant.shots,
    canvasSpec: canvas,
    audio,
    // Probed durations only. An unprobed clip is unknown, never zero.
    sourceMs: (id) => {
      const seconds = assets.get(id)?.durationSeconds;
      return seconds == null ? null : seconds * 1000;
    },
  });
  const notes = durationIssues(spec, canvas).map((i) => i.message);
  if (!spec.shots.length) return { error: "This plan has no clips attached, so there is nothing to assemble." };

  const clips: Record<string, ClipBytes> = {};
  for (const shot of spec.shots) {
    const clip = await fetchClip(assets.get(shot.assetId));
    if (clip) clips[shot.assetId] = clip;
  }

  const renderSpec = resolveRenderSpec({ variant, placement: input.placement, kit });
  const overlay = renderSpec.texts.length || renderSpec.logos.length ? await renderOverlayLayer(renderSpec) : null;

  const result = await assembleVideo({
    spec,
    clips,
    voiceover: await fetchClip(audio?.voiceoverAssetId ? assets.get(audio.voiceoverAssetId) : undefined),
    music: await fetchClip(audio?.musicAssetId ? assets.get(audio.musicAssetId) : undefined),
    overlay: overlay?.bytes,
    ass: plan.captions?.burnIn === false
      ? undefined
      : await captionsFor(item.workspaceId, audio?.voiceoverAssetId, plan.captions?.language ?? "en", canvas, kit.visual?.typography?.bodyFamily?.trim() || "", swatch(kit, "surface"), swatch(kit, "primary")),
  });
  if (!result.ok) return { error: result.reason };

  // A cut is only as usable as its most restricted ingredient — and "most
  // restricted" lives on four axes that do not travel together.
  const ingredients = [
    ...spec.shots.map((s) => assets.get(s.assetId)),
    audio?.voiceoverAssetId ? assets.get(audio.voiceoverAssetId) : undefined,
    audio?.musicAssetId ? assets.get(audio.musicAssetId) : undefined,
  ].filter((a): a is Asset => Boolean(a));
  const rights = mergeRights(ingredients);
  const narrowingNote = describeNarrowing(rights, ingredients);
  if (narrowingNote) notes.push(narrowingNote);

  // The picture decides the length, so a longer voice-over gets CUT OFF. Never
  // silently: somebody wrote that script and needs to know it did not all fit.
  const voSeconds = audio?.voiceoverAssetId ? assets.get(audio.voiceoverAssetId)?.durationSeconds : null;
  if (voSeconds != null && voSeconds * 1000 > spec.totalMs + 250) {
    notes.push(
      `The voice-over is ${voSeconds}s but this cut is ${(spec.totalMs / 1000).toFixed(1)}s, so the end of it was cut off. Lengthen the shots or shorten the script.`,
    );
  }

  const assetId = await writeDerivedAsset({
    actor: { organizationId: item.organizationId, workspaceId: item.workspaceId, userId: item.ownerUserId },
    // Lineage points at the opening shot; the rights envelope comes from ALL of them.
    base: assets.get(spec.shots[0].assetId) ?? null,
    rights,
    bytes: result.bytes,
    mimeType: result.mimeType,
    kind: "video",
    width: spec.canvas.width,
    height: spec.canvas.height,
    durationSeconds: Math.round(spec.totalMs / 1000),
    fileName: `ad-${input.placement}-${variant.id.replace(/[^a-z0-9]+/gi, "-")}${result.extension}`,
    altText: renderSpec.texts.map((t) => t.text).join(". ") || null,
    action: `assembled for ${canvas.label}`,
    extraChain: overlay ? ["type composited from the brand kit"] : [],
  });

  const [fresh] = await db.select({ adPlan: contentItem.adPlan }).from(contentItem).where(eq(contentItem.id, item.id));
  const current = readPlan(fresh?.adPlan);
  if (current) {
    await savePlan(item.id, withRender(current, {
      placement: input.placement,
      variantId: variant.id,
      assetId,
      fingerprint: fingerprint(renderSpec),
      renderedAt: new Date().toISOString(),
    }));
  }

  return { assetId, notes: [...notes, ...result.notes] };
}
