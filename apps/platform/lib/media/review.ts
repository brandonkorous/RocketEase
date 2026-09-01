/*
 * Loading everything preflight needs, in one place.
 *
 * Both the review action and the render action run this. That is the point: an
 * action that only *offers* a check is not a check, so rendering enforces the
 * same rules the review screen shows, from the same code.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import type { contentItem } from "@/db/schema/content";
import { loadBrandKit } from "@/lib/brand/load";
import type { BrandKit } from "@/lib/brand/types";
import { renderStatuses, type RenderStatus } from "./compose/fingerprint";
import { readPlan } from "./plan/schema";
import type { AdPlan } from "./plan/types";
import { renderCount } from "./plan/variants";
import { preflightPlan, warn, type CreativeIssue, type PreflightAsset } from "./preflight";
import { specFor } from "./canvas/specs";
import { buildAssemblySpec, durationIssues } from "./video/spec";

type Item = typeof contentItem.$inferSelect;

export type PlanReview = {
  plan: AdPlan;
  kit: BrandKit;
  issues: CreativeIssue[];
  statuses: RenderStatus[];
  renders: number;
  skipped: number;
  /**
   * Whether this plan produces moving pictures. Derived from what its shots
   * actually ARE, not declared — nobody should have to tell us that a plan full
   * of video clips is a video.
   */
  isVideo: boolean;
};

/** Every asset the plan depends on: shot imagery and opening-frame alternatives. */
function referencedIds(plan: AdPlan): string[] {
  const ids = new Set<string>();
  for (const shot of plan.shots) if (shot.assetId) ids.add(shot.assetId);
  for (const axis of plan.variants) if (axis.kind === "opening_frame") for (const v of axis.values) ids.add(v);
  return [...ids];
}

/** Workspace-scoped on purpose: an asset id from another tenant must not resolve. */
async function loadAssets(workspaceId: string, ids: string[]): Promise<Map<string, PreflightAsset>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select()
    .from(asset)
    .where(and(eq(asset.workspaceId, workspaceId), inArray(asset.id, ids), isNull(asset.deletedAt)));
  return new Map(rows.map((r) => [r.id, r as unknown as PreflightAsset]));
}

/** Length and hook checks, per placement, for a plan that assembles a cut. */
function videoIssues(plan: AdPlan, assets: Map<string, PreflightAsset>): CreativeIssue[] {
  const sourceMs = (id: string) => {
    const seconds = assets.get(id)?.durationSeconds;
    return seconds == null ? null : seconds * 1000;
  };
  return plan.placements.flatMap((placement) => {
    const canvas = specFor(placement);
    const spec = buildAssemblySpec({ shots: plan.shots, canvasSpec: canvas, audio: plan.audio, sourceMs });
    return durationIssues(spec, canvas).map((i) => warn(i.code, i.message, { placement }));
  });
}

export async function reviewPlan(item: Item): Promise<PlanReview | { error: string }> {
  const plan = readPlan(item.adPlan);
  if (!plan) return { error: "This draft has no ad plan, or the stored plan could not be read." };

  const kit = await loadBrandKit(item.workspaceId);
  const assets = await loadAssets(item.workspaceId, referencedIds(plan));
  const isVideo = plan.shots.some((s) => s.assetId && assets.get(s.assetId)?.kind === "video");

  const issues = preflightPlan({ plan, kit, assets });
  if (isVideo) issues.push(...videoIssues(plan, assets));

  return { plan, kit, issues, statuses: renderStatuses(plan, kit), ...renderCount(plan), isVideo };
}
