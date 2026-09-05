"use server";

/*
 * Ad plan actions (M12.2).
 *
 * Every entry point checks the beta grant SERVER-SIDE and then the workspace
 * capability — hiding a button is not access control, and neither is a feature
 * flag on its own.
 *
 * Rendering is enqueued, never done inline: a person asking for five placements
 * is asking for five CPU-bound jobs on the media worker, not a slow request.
 * And rendering ENFORCES the same preflight the review screen shows — an action
 * that merely offers a check is not a check.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contentItem } from "@/db/schema/content";
import { audit } from "@/lib/audit";
import { hasFeature } from "@/lib/features";
import { emit } from "@/lib/jobs/outbox";
import { CANVAS_SPECS, PLACEMENTS, type Placement } from "@/lib/media/canvas/specs";
import { renderKey, renderStatuses } from "@/lib/media/compose/fingerprint";
import { unacceptedFor, withAcceptances } from "@/lib/media/plan/acceptance";
import { adPlanSchema } from "@/lib/media/plan/schema";
import { expandVariants } from "@/lib/media/plan/variants";
import { blocking } from "@/lib/media/preflight";
import { reviewPlan, type PlanReview } from "@/lib/media/review";
import { requireCapability, requireWorkspace } from "@/lib/session";
import { fail, guard, type ActionState } from "@/lib/actions/content/shared";

const NO_ACCESS = "Ad creative isn't available for this organization.";

const idSchema = z.object({ workspaceId: z.string().min(1), contentItemId: z.string().min(1) });
const saveSchema = idSchema.extend({ plan: adPlanSchema });
const renderSchema = idSchema.extend({
  placement: z.enum(PLACEMENTS).optional(),
  variantId: z.string().min(1).optional(),
});

/**
 * Membership, then capability, then the beta grant — in that order, every call.
 * Reading a plan needs membership only; changing or rendering one needs
 * `content.create`, because a render writes a new asset into the library.
 */
async function gate(workspaceId: string, capability?: "content.create") {
  const ctx = capability ? await requireCapability(workspaceId, capability) : await requireWorkspace(workspaceId);
  return (await hasFeature(ctx.workspace.organizationId, "media.generation")) ? ctx : null;
}

/** The item, scoped to the workspace the caller was authorised for. */
async function loadItem(workspaceId: string, contentItemId: string) {
  const [row] = await db.select().from(contentItem).where(eq(contentItem.id, contentItemId));
  return row && row.workspaceId === workspaceId && !row.deletedAt ? row : null;
}

export async function saveAdPlan(input: z.input<typeof saveSchema>): Promise<ActionState> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "That plan can't be saved.");
  return guard(async () => {
    const ctx = await gate(parsed.data.workspaceId, "content.create");
    if (!ctx) return fail(NO_ACCESS);
    const item = await loadItem(parsed.data.workspaceId, parsed.data.contentItemId);
    if (!item) return fail("That draft no longer exists.");

    await db.update(contentItem).set({ adPlan: parsed.data.plan, updatedAt: new Date() }).where(eq(contentItem.id, item.id));
    await audit({
      action: "content.update",
      actorUserId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId: item.workspaceId,
      targetType: "content_item",
      targetId: item.id,
      summary: { note: "ad plan saved", after: { placements: parsed.data.plan.placements, variants: parsed.data.plan.variants.length } },
    });
    return { ok: "Ad plan saved." };
  });
}

export type PlanReport = Omit<PlanReview, "plan" | "kit">;

/** Everything checkable before a render: rights, clearance, resolution, structure. */
export async function reviewAdPlan(input: z.input<typeof idSchema>): Promise<PlanReport | { error: string }> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request" };
  if (!(await gate(parsed.data.workspaceId))) return { error: NO_ACCESS };
  const item = await loadItem(parsed.data.workspaceId, parsed.data.contentItemId);
  if (!item) return { error: "That draft no longer exists." };

  const review = await reviewPlan(item);
  if ("error" in review) return review;
  const { plan: _plan, kit: _kit, ...report } = review;
  return report;
}

type ItemRow = NonNullable<Awaited<ReturnType<typeof loadItem>>>;

/**
 * Queue renders for (placements × non-inert variants). `onlyStale` skips pairs
 * whose render already matches the plan — accepting an untouched plan twice
 * re-renders nothing. Inert variants are skipped rather than duplicated.
 */
async function queueRenders(
  item: ItemRow,
  review: PlanReview,
  placements: Placement[],
  opts: { variantId?: string; onlyStale?: boolean } = {},
): Promise<number> {
  const variants = expandVariants(review.plan).filter((v) => !v.inert && (!opts.variantId || v.id === opts.variantId));
  const current = opts.onlyStale
    ? new Set(
        renderStatuses(review.plan, review.kit)
          .filter((s) => s.state === "current")
          .map((s) => renderKey(s.placement, s.variantId)),
      )
    : new Set<string>();

  // Still or cut is decided by what the plan's shots ARE, not by a flag
  // somebody has to remember to set.
  const kind = review.isVideo ? "assembly" : "ad_plan";
  let queued = 0;
  await db.transaction(async (tx) => {
    for (const variant of variants) {
      for (const placement of placements) {
        if (current.has(renderKey(placement, variant.id))) continue;
        // The dedupe key keeps ONE render per (item, placement, variant) in
        // flight. A completed job frees it, so re-rendering after an edit works.
        await emit(tx, "media.render", { kind, contentItemId: item.id, placement, variantId: variant.id }, {
          organizationId: item.organizationId,
          workspaceId: item.workspaceId,
          dedupeKey: `media.render:${item.id}:${placement}:${variant.id}`,
        });
        queued += 1;
      }
    }
  });
  return queued;
}

/**
 * Queue renders. With no placement/variant it renders everything the plan
 * currently describes. M12.6: this is the FLATTEN, so it runs only for
 * placements a person has accepted since the last edit — acceptance is the
 * gate, and acceptAdPlan is the door.
 */
export async function renderAdPlan(input: z.input<typeof renderSchema>): Promise<ActionState & { queued?: number }> {
  const parsed = renderSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request");
  return guard(async () => {
    if (!(await gate(parsed.data.workspaceId, "content.create"))) return fail(NO_ACCESS);
    const item = await loadItem(parsed.data.workspaceId, parsed.data.contentItemId);
    if (!item) return fail("That draft no longer exists.");

    const review = await reviewPlan(item);
    if ("error" in review) return fail(review.error);

    // Enforced here, not merely offered by reviewAdPlan. Queueing five renders
    // of a packshot whose licence expired is work nobody wants done.
    const blockers = blocking(review.issues);
    if (blockers.length) return fail(blockers[0].message);

    const placements = parsed.data.placement ? [parsed.data.placement] : review.plan.placements;
    const unaccepted = unacceptedFor(review.plan, review.kit, placements);
    if (unaccepted.length) {
      return fail(`${CANVAS_SPECS[unaccepted[0]].label} hasn't been accepted since its last edit — review the preview and accept it first.`);
    }

    const queued = await queueRenders(item, review, placements, { variantId: parsed.data.variantId });
    if (!queued) return fail("There is nothing to render — every variant would be identical to the base.");
    const noun = review.isVideo ? "video" : "image";
    return { ok: `Rendering ${queued} ${noun}${queued === 1 ? "" : "s"}. They'll appear in the library when they're done.`, queued };
  });
}

/**
 * Accept — the human action that turns a previewed placement into files
 * (M12.6 WP1/WP5). Records the acceptance at the plan's current fingerprint,
 * audits it, and queues the flatten for anything not already current. A later
 * edit stales the acceptance and the draft reopens.
 */
export async function acceptAdPlan(input: z.input<typeof renderSchema>): Promise<ActionState & { queued?: number }> {
  const parsed = renderSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request");
  return guard(async () => {
    const ctx = await gate(parsed.data.workspaceId, "content.create");
    if (!ctx) return fail(NO_ACCESS);
    const item = await loadItem(parsed.data.workspaceId, parsed.data.contentItemId);
    if (!item) return fail("That draft no longer exists.");

    const review = await reviewPlan(item);
    if ("error" in review) return fail(review.error);
    const blockers = blocking(review.issues);
    if (blockers.length) return fail(blockers[0].message);

    const placements = parsed.data.placement ? [parsed.data.placement] : review.plan.placements;
    const accepted = withAcceptances(review.plan, review.kit, placements, ctx.session.user.id);
    if ("error" in accepted) return fail(accepted.error);

    await db.update(contentItem).set({ adPlan: accepted.plan, updatedAt: new Date() }).where(eq(contentItem.id, item.id));
    await audit({
      action: "content.update",
      actorUserId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId: item.workspaceId,
      targetType: "content_item",
      targetId: item.id,
      summary: { note: "ad plan accepted", after: { placements } },
    });

    const queued = await queueRenders(item, { ...review, plan: accepted.plan }, placements, { onlyStale: true });
    if (queued === 0) return { ok: "Accepted. Every file already matches this plan — nothing needed re-rendering.", queued };
    return { ok: `Accepted. Rendering ${queued} file${queued === 1 ? "" : "s"}. They'll appear in the library when they're done.`, queued };
  });
}
