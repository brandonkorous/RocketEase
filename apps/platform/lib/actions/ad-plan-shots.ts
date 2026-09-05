"use server";

/*
 * Shot regeneration (M12.6 WP4) — the ONE paid edit in the plan editor.
 *
 * Everything else in the editor re-runs a composite for free; swapping the
 * pixels inside a shot is a vendor spend. So the flow is estimate-first, spend
 * second, adopt third:
 *
 *   previewShotGeneration — what would run and what it bills, BEFORE the button
 *   regenerateShot        — the spend, through the same routing/ceiling/consent
 *                           gate every generation takes
 *   adoptShotAsset        — the person saw the new take and chose it; nothing
 *                           mutates the plan behind their back
 *
 * Whole-plan orchestration (generate every missing take at once) lives in
 * ad-plan-takes.ts; the shared prep is lib/media/take-prep.ts.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { isUnknownCost } from "@rocketease/media";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import { contentItem } from "@/db/schema/content";
import { mediaJob } from "@/db/schema/media";
import { fail, guard, type ActionState } from "@/lib/actions/content/shared";
import { audit } from "@/lib/audit";
import { hasFeature } from "@/lib/features";
import { createMediaJob, previewJob } from "@/lib/media/jobs";
import { creditsLine, loadShot, specFor } from "@/lib/media/take-prep";
import { requireCapability, requireWorkspace } from "@/lib/session";

const NO_ACCESS = "Ad creative isn't available for this organization.";

const shotIdSchema = z.object({
  workspaceId: z.string().min(1),
  contentItemId: z.string().min(1),
  shotId: z.string().min(1),
});
const adoptSchema = shotIdSchema.extend({ assetId: z.string().min(1) });

export type ShotPreview = { model: string; reason: string; credits: string; roundedNote?: string } | { error: string };

/** What "Regenerate this shot" shows BEFORE the button — model, why, credits. */
export async function previewShotGeneration(input: z.input<typeof shotIdSchema>): Promise<ShotPreview> {
  const parsed = shotIdSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const ctx = await requireWorkspace(parsed.data.workspaceId);
  if (!(await hasFeature(ctx.workspace.organizationId, "media.generation"))) return { error: NO_ACCESS };

  const loaded = await loadShot(parsed.data.workspaceId, parsed.data.contentItemId, parsed.data.shotId);
  if ("error" in loaded) return loaded;

  const { spec, roundedNote } = specFor(loaded.plan, loaded.shot);
  const preview = previewJob(spec);
  if ("error" in preview) return { error: preview.error ?? "No model can run this shot." };

  const quantity = isUnknownCost(preview.estimate) ? null : preview.estimate.quantity;
  return {
    model: preview.model.label,
    reason: preview.reason,
    credits: await creditsLine(parsed.data.workspaceId, preview.model.key, loaded.shot.jobKind, quantity),
    ...(roundedNote ? { roundedNote } : {}),
  };
}

/** The spend. Routing, ceiling and consent run inside createMediaJob, unchanged. */
export async function regenerateShot(input: z.input<typeof shotIdSchema>): Promise<ActionState & { mediaJobId?: string }> {
  const parsed = shotIdSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request");
  return guard(async () => {
    const ctx = await requireCapability(parsed.data.workspaceId, "content.create");
    if (!(await hasFeature(ctx.workspace.organizationId, "media.generation"))) return fail(NO_ACCESS);

    const loaded = await loadShot(parsed.data.workspaceId, parsed.data.contentItemId, parsed.data.shotId);
    if ("error" in loaded) return fail(loaded.error);

    const { spec } = specFor(loaded.plan, loaded.shot);
    const created = await createMediaJob({
      organizationId: ctx.workspace.organizationId,
      workspaceId: parsed.data.workspaceId,
      userId: ctx.session.user.id,
      spec,
    });
    if ("error" in created) return fail(created.error);
    return {
      ok: "Generating a new take. It appears beside the shot when it's done — the plan keeps the current one until you adopt it.",
      mediaJobId: created.mediaJobId,
    };
  });
}

const statusSchema = z.object({ workspaceId: z.string().min(1), mediaJobId: z.string().min(1) });
export type ShotJobStatus = { state: string; assetId?: string; errorNote?: string } | { error: string };

/** Where a regeneration stands — polled by the editor while the take renders. */
export async function shotJobStatus(input: z.input<typeof statusSchema>): Promise<ShotJobStatus> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  const ctx = await requireWorkspace(parsed.data.workspaceId);
  if (!(await hasFeature(ctx.workspace.organizationId, "media.generation"))) return { error: NO_ACCESS };

  const [row] = await db.select().from(mediaJob).where(eq(mediaJob.id, parsed.data.mediaJobId));
  if (!row || row.workspaceId !== parsed.data.workspaceId) return { error: "That generation no longer exists." };
  return {
    state: row.state,
    ...(row.assetIds[0] ? { assetId: row.assetIds[0] } : {}),
    ...(row.errorNote ? { errorNote: row.errorNote } : {}),
  };
}

/** The person saw the new take and chose it. Only now does the plan change. */
export async function adoptShotAsset(input: z.input<typeof adoptSchema>): Promise<ActionState> {
  const parsed = adoptSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request");
  return guard(async () => {
    const ctx = await requireCapability(parsed.data.workspaceId, "content.create");
    if (!(await hasFeature(ctx.workspace.organizationId, "media.generation"))) return fail(NO_ACCESS);

    const loaded = await loadShot(parsed.data.workspaceId, parsed.data.contentItemId, parsed.data.shotId);
    if ("error" in loaded) return fail(loaded.error);

    const [row] = await db.select({ workspaceId: asset.workspaceId }).from(asset).where(eq(asset.id, parsed.data.assetId));
    if (row?.workspaceId !== parsed.data.workspaceId) return fail("That asset isn't in this workspace's library.");

    const shots = loaded.plan.shots.map((s) => (s.id === loaded.shot.id ? { ...s, assetId: parsed.data.assetId } : s));
    await db
      .update(contentItem)
      .set({ adPlan: { ...loaded.plan, shots }, updatedAt: new Date() })
      .where(eq(contentItem.id, loaded.item.id));
    await audit({
      action: "content.update",
      actorUserId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId: parsed.data.workspaceId,
      targetType: "content_item",
      targetId: loaded.item.id,
      summary: { note: "shot asset adopted", after: { shotId: loaded.shot.id, assetId: parsed.data.assetId } },
    });
    return { ok: "New take adopted. The preview now uses it; accepted placements reopen until you accept again." };
  });
}
