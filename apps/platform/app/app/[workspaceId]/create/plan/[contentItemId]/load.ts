/*
 * Loader for the plan editor (M12.6 WP3).
 *
 * Server-side only: the beta gate, the plan, presigned asset URLs, brand logo
 * URLs, caption cues (derived from words on every read — nothing stored goes
 * stale), preflight issues and the acceptance/render statuses. The client gets
 * data, never keys.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import { contentItem } from "@/db/schema/content";
import { hasFeature } from "@/lib/features";
import { buildCues, cueText } from "@/lib/media/captions/cues";
import { tracksForAsset } from "@/lib/media/captions/store";
import { acceptanceStatuses } from "@/lib/media/plan/acceptance";
import { starterPlan } from "@/lib/media/plan/starter";
import { readPlan } from "@/lib/media/plan/schema";
import type { AdPlan } from "@/lib/media/plan/types";
import { canGenerate, modelsAvailableFor } from "@/lib/media/jobs";
import { reviewPlan } from "@/lib/media/review";
import { loadBrandKit } from "@/lib/brand/store";
import { listWorkspaceVoices } from "@/lib/actions/voice";
import { presignGet } from "@/lib/storage";
import { requireWorkspace } from "@/lib/session";
import type { EditorAsset, EditorCue, EditorData } from "@/components/plan-editor/types";

/** Every asset id a plan mentions: shots, voice-over, music. */
const referencedAssetIds = (plan: AdPlan): string[] => {
  const ids = new Set<string>();
  for (const s of plan.shots) if (s.assetId) ids.add(s.assetId);
  if (plan.audio?.voiceoverAssetId) ids.add(plan.audio.voiceoverAssetId);
  if (plan.audio?.musicAssetId) ids.add(plan.audio.musicAssetId);
  return [...ids];
};

async function loadAssets(workspaceId: string, ids: string[]): Promise<Record<string, EditorAsset>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({ id: asset.id, workspaceId: asset.workspaceId, kind: asset.kind, fileName: asset.fileName, storageKey: asset.storageKey, durationSeconds: asset.durationSeconds })
    .from(asset)
    .where(inArray(asset.id, ids));
  const out: Record<string, EditorAsset> = {};
  for (const r of rows) {
    if (r.workspaceId !== workspaceId) continue;
    out[r.id] = {
      id: r.id,
      kind: r.kind as EditorAsset["kind"],
      fileName: r.fileName,
      url: await presignGet(r.storageKey).catch(() => null),
      durationSeconds: r.durationSeconds,
    };
  }
  return out;
}

/** Cues of the voice-over's caption track — derived from words, never stored. */
async function loadCues(voiceoverAssetId: string | undefined, language: string): Promise<EditorCue[]> {
  if (!voiceoverAssetId) return [];
  const tracks = await tracksForAsset(voiceoverAssetId);
  const track = tracks.find((t) => t.language === language) ?? tracks[0];
  if (!track) return [];
  return buildCues(track.words).map((c) => ({ startMs: c.startMs, endMs: c.endMs, text: cueText(c) }));
}

export type EditorLoad = { kind: "ok"; data: EditorData } | { kind: "no_feature" } | { kind: "not_found" };

export async function loadPlanEditor(workspaceId: string, contentItemId: string): Promise<EditorLoad> {
  const ctx = await requireWorkspace(workspaceId);
  // Absent, not locked (docs/media-generation.md §9a): outside the beta this
  // route does not exist, because nothing explains a door that can't be bought.
  if (!(await hasFeature(ctx.workspace.organizationId, "media.generation"))) return { kind: "no_feature" };

  const [item] = await db.select().from(contentItem).where(eq(contentItem.id, contentItemId));
  if (!item || item.workspaceId !== workspaceId || item.deletedAt) return { kind: "not_found" };

  const kit = await loadBrandKit(workspaceId);
  const stored = readPlan(item.adPlan);
  const plan =
    stored ??
    starterPlan({
      objective: "sales",
      title: item.title?.trim() || "Untitled ad",
      placements: ["meta_reels_9x16", "meta_feed_4x5"],
      headline: item.title?.trim() || "Your headline",
      kit,
    });

  // Preflight and render statuses exist only for a STORED plan — reviewPlan
  // reads the row, and an unsaved starter has nothing to review yet.
  const review = stored ? await reviewPlan(item) : null;
  const issues = review && !("error" in review) ? review.issues : [];
  const statuses = review && !("error" in review) ? review.statuses : [];

  // Keyed by STORAGE KEY — the render spec's logo locator carries the key,
  // not the role (brand logos are objects, not assets: lib/media/locator.ts).
  const logoUrls: Record<string, string> = {};
  for (const logo of kit?.visual?.logos ?? []) {
    if (!logo.key) continue;
    const url = await presignGet(logo.key).catch(() => null);
    if (url) logoUrls[logo.key] = url;
  }

  const voices = await listWorkspaceVoices(workspaceId);
  return {
    kind: "ok",
    data: {
      workspaceId,
      contentItemId,
      plan,
      planExists: Boolean(stored),
      kit,
      assets: await loadAssets(workspaceId, referencedAssetIds(plan)),
      logoUrls,
      cues: await loadCues(plan.audio?.voiceoverAssetId, plan.captions?.language ?? "en"),
      statuses,
      acceptance: acceptanceStatuses(plan, kit),
      issues,
      voices: Array.isArray(voices) ? voices.filter((v) => v.usable).map((v) => ({ id: v.id, label: v.label, kind: v.kind })) : [],
      regenEnabled: canGenerate("scene_still") || canGenerate("hero_shot"),
      takeSeconds: modelsAvailableFor("hero_shot")[0]?.io.outputs.duration?.allowed ?? [5, 10],
    },
  };
}
