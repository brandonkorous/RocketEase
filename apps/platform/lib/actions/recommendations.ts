"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { recommendation } from "@/db/schema/recommendations";
import { emit } from "@/lib/jobs/outbox";
import { audit } from "@/lib/audit";
import { loadBestTimes, type BestTime } from "@/lib/recommendations/best-times";
import { requireCapability, requireWorkspace } from "@/lib/session";
import { fail, guard, type ActionState } from "./content/shared";

const decideSchema = z.object({ workspaceId: z.string().min(1), id: z.string().min(1), status: z.enum(["dismissed", "applied"]) });

/**
 * Dismiss or mark a recommendation applied. Acting on advice is a content
 * decision, so it takes `content.create` — analysts and viewers can read the
 * list but never change what the team sees.
 */
export async function decideRecommendation(input: z.input<typeof decideSchema>): Promise<ActionState> {
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid recommendation.");
  const { workspaceId, id, status } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const [row] = await db
      .update(recommendation)
      .set({ status, decidedByUserId: ctx.session.user.id, decidedAt: new Date() })
      .where(and(eq(recommendation.id, id), eq(recommendation.workspaceId, workspaceId)))
      .returning({ id: recommendation.id, kind: recommendation.kind, target: recommendation.target });
    if (!row) return fail("That recommendation is no longer available.");
    await audit({ action: `recommendation.${status === "applied" ? "apply" : "dismiss"}`, actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "recommendation", targetId: row.id, summary: { after: { kind: row.kind, target: row.target, status } } });
    return { ok: status === "applied" ? "Marked as applied." : "Dismissed." };
  });
}

export async function dismissRecommendation(workspaceId: string, id: string) {
  return decideRecommendation({ workspaceId, id, status: "dismissed" });
}
export async function applyRecommendation(workspaceId: string, id: string) {
  return decideRecommendation({ workspaceId, id, status: "applied" });
}

/** Queue an out-of-band recompute for this workspace (the job also runs nightly). */
export async function recomputeRecommendations(workspaceId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "analytics.view");
    await emit(db, "recommendations.compute", { workspaceId }, { organizationId: ctx.workspace.organizationId, workspaceId, dedupeKey: `recommendations.compute:${workspaceId}` });
    await audit({ action: "recommendation.recompute", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "workspace", targetId: workspaceId });
    return { ok: "Recomputing — refresh in a moment." };
  });
}

/** Best-time slots for the composer's selected channels. Empty means "not enough data". */
export async function bestTimesFor(workspaceId: string, channelIds: string[]): Promise<BestTime[]> {
  await requireWorkspace(workspaceId);
  return loadBestTimes(workspaceId, channelIds.slice(0, 20), 3);
}
