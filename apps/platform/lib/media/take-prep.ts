/*
 * Shared preparation for generating a shot's take (M12.6 WP4 + orchestration).
 * Used by both the single-shot actions and the generate-all batch: load the
 * shot in its workspace, build the spec with the duration rounded UP to the
 * default route's terms, and say what it bills — in CREDITS, because vendor
 * dollars are our margin and never reach a workspace.
 */
import { eq } from "drizzle-orm";
import { MEDIA_KIND_OF, type GenerationSpec } from "@rocketease/media";
import { db } from "@/db";
import { contentItem } from "@/db/schema/content";
import { formatCredits } from "@/lib/ai/usage/credits";
import { creditsForQuantity, parseCreditRates } from "@/lib/media/credit-rates";
import { imageUnitEstimate, videoUnitEstimate } from "@/lib/media/estimate";
import { modelsAvailableFor } from "@/lib/media/jobs";
import { readPlan } from "@/lib/media/plan/schema";
import { generationSeconds, shotSpec } from "@/lib/media/plan/shot-spec";
import type { AdPlan, Shot } from "@/lib/media/plan/types";

export type LoadedItem = { item: typeof contentItem.$inferSelect; plan: AdPlan };

/** The item and its plan, workspace-scoped — or a reason. */
export async function loadPlanItem(workspaceId: string, contentItemId: string): Promise<LoadedItem | { error: string }> {
  const [item] = await db.select().from(contentItem).where(eq(contentItem.id, contentItemId));
  if (!item || item.workspaceId !== workspaceId || item.deletedAt) return { error: "That draft no longer exists." };
  const plan = readPlan(item.adPlan);
  if (!plan) return { error: "This draft has no ad plan, or the stored plan could not be read." };
  return { item, plan };
}

/** As above, plus one named shot. */
export async function loadShot(workspaceId: string, contentItemId: string, shotId: string): Promise<(LoadedItem & { shot: Shot }) | { error: string }> {
  const loaded = await loadPlanItem(workspaceId, contentItemId);
  if ("error" in loaded) return loaded;
  const shot = loaded.plan.shots.find((s) => s.id === shotId);
  if (!shot) return { error: "That shot is no longer in the plan." };
  return { ...loaded, shot };
}

/** The spec to submit, with the duration rounded UP to the default route's terms. */
export function specFor(plan: AdPlan, shot: Shot): { spec: GenerationSpec; roundedNote?: string } {
  const spec = shotSpec(plan, shot);
  if (spec.durationSeconds === undefined) return { spec };
  const candidate = modelsAvailableFor(spec.jobKind)[0];
  const rounded = candidate ? generationSeconds(candidate.io, spec.durationSeconds) : null;
  if (rounded === null || rounded === spec.durationSeconds) return { spec };
  return {
    spec: { ...spec, durationSeconds: rounded },
    roundedNote: `The model renders ${rounded}-second takes, so a ${spec.durationSeconds}-second shot is cut from one in assembly.`,
  };
}

/** Credits this spend bills — configured rate, or null when genuinely unpriced. */
export function takeCredits(modelKey: string, quantity: number | null): number | null {
  return creditsForQuantity(modelKey, quantity, parseCreditRates(process.env.AI_MEDIA_CREDIT_RATES_JSON));
}

/** The credits line for one take — configured rate first, history second, honesty last. */
export async function creditsLine(workspaceId: string, modelKey: string, jobKind: Shot["jobKind"], quantity: number | null): Promise<string> {
  const configured = takeCredits(modelKey, quantity);
  if (configured !== null) return `This take bills ${formatCredits(configured)} credits.`;
  const history = MEDIA_KIND_OF[jobKind] === "video" ? await videoUnitEstimate(workspaceId) : await imageUnitEstimate(workspaceId);
  return history ?? "This model's credit price isn't configured yet.";
}
