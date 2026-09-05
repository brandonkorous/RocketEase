"use server";

/*
 * Whole-plan take generation (M12.6 orchestration).
 *
 * The person chose a real content length; the plan holds the takes that add
 * up to it. This is the button that generates every take that is still
 * missing — one media job per shot, each through the same routing, ceiling
 * and consent gates, with the TOTAL credits shown before anything spends.
 * Unpriced shots are counted, never summed as zero (the totalEstimate rule).
 */
import { z } from "zod";
import { isUnknownCost } from "@rocketease/media";
import { fail, guard, type ActionState } from "@/lib/actions/content/shared";
import { formatCredits } from "@/lib/ai/usage/credits";
import { hasFeature } from "@/lib/features";
import { createMediaJob, previewJob } from "@/lib/media/jobs";
import type { Shot } from "@/lib/media/plan/types";
import { loadPlanItem, specFor, takeCredits } from "@/lib/media/take-prep";
import { requireCapability, requireWorkspace } from "@/lib/session";

const NO_ACCESS = "Ad creative isn't available for this organization.";

const idSchema = z.object({ workspaceId: z.string().min(1), contentItemId: z.string().min(1) });

/** Shots still needing a take: no adopted asset, and enough direction to shoot. */
const missingTakes = (shots: Shot[]) => shots.filter((s) => !s.assetId);

export type TakesPreview =
  | {
      takes: { shotId: string; label: string; credits: string; error?: string }[];
      totalLine: string;
      ready: number;
    }
  | { error: string };

/** What "Generate all missing takes" shows BEFORE the button. */
export async function previewAllTakes(input: z.input<typeof idSchema>): Promise<TakesPreview> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const ctx = await requireWorkspace(parsed.data.workspaceId);
  if (!(await hasFeature(ctx.workspace.organizationId, "media.generation"))) return { error: NO_ACCESS };

  const loaded = await loadPlanItem(parsed.data.workspaceId, parsed.data.contentItemId);
  if ("error" in loaded) return loaded;
  const missing = missingTakes(loaded.plan.shots);
  if (missing.length === 0) return { error: "Every shot already has a take. Regenerate one from its own row instead." };

  let total = 0;
  let unpriced = 0;
  let ready = 0;
  const takes = missing.map((shot, i) => {
    const label = `Shot ${loaded.plan.shots.indexOf(shot) + 1}${shot.durationSeconds ? ` · ${shot.durationSeconds}s` : ""}`;
    if (shot.direction.trim().length < 3) return { shotId: shot.id, label, credits: "", error: "Needs direction before it can be generated." };
    const preview = previewJob(specFor(loaded.plan, shot).spec);
    if ("error" in preview) return { shotId: shot.id, label, credits: "", error: preview.error ?? "No model can run this shot." };
    ready += 1;
    const quantity = isUnknownCost(preview.estimate) ? null : preview.estimate.quantity;
    const credits = takeCredits(preview.model.key, quantity);
    if (credits === null) {
      unpriced += 1;
      return { shotId: shot.id, label: `${label} · ${preview.model.label}`, credits: "not priced yet" };
    }
    total += credits;
    return { shotId: shot.id, label: `${label} · ${preview.model.label}`, credits: `${formatCredits(credits)} credits` };
  });

  const parts = [total > 0 ? `${formatCredits(total)} credits total` : null, unpriced > 0 ? `${unpriced} take${unpriced === 1 ? "" : "s"} unpriced` : null];
  return { takes, ready, totalLine: parts.filter(Boolean).join(" · ") || "Nothing priceable to generate." };
}

export type TakesResult = ActionState & { jobs?: { shotId: string; mediaJobId: string }[] };

/** The spend: one job per ready shot. Failures name the shot and stop nothing else. */
export async function generateAllTakes(input: z.input<typeof idSchema>): Promise<TakesResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request");
  return guard(async () => {
    const ctx = await requireCapability(parsed.data.workspaceId, "content.create");
    if (!(await hasFeature(ctx.workspace.organizationId, "media.generation"))) return fail(NO_ACCESS);

    const loaded = await loadPlanItem(parsed.data.workspaceId, parsed.data.contentItemId);
    if ("error" in loaded) return fail(loaded.error);
    const missing = missingTakes(loaded.plan.shots).filter((s) => s.direction.trim().length >= 3);
    if (missing.length === 0) return fail("No shot is ready to generate — give each one direction first.");

    const jobs: { shotId: string; mediaJobId: string }[] = [];
    const failures: string[] = [];
    for (const shot of missing) {
      const created = await createMediaJob({
        organizationId: ctx.workspace.organizationId,
        workspaceId: parsed.data.workspaceId,
        userId: ctx.session.user.id,
        spec: specFor(loaded.plan, shot).spec,
      });
      if ("error" in created) failures.push(`Shot ${loaded.plan.shots.indexOf(shot) + 1}: ${created.error}`);
      else jobs.push({ shotId: shot.id, mediaJobId: created.mediaJobId });
    }

    if (jobs.length === 0) return fail(failures[0] ?? "Nothing could be generated.");
    const failed = failures.length ? ` ${failures.length} shot${failures.length === 1 ? "" : "s"} refused: ${failures[0]}` : "";
    return {
      ok: `Generating ${jobs.length} take${jobs.length === 1 ? "" : "s"}. Adopt each one as it lands — assembly joins them into one video on accept.${failed}`,
      jobs,
    };
  });
}
