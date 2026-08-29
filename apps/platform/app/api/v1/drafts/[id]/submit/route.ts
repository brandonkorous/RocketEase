import { z } from "zod";
import { db } from "@/db";
import { authenticateApi, requireScope } from "@/lib/api/auth";
import { apiBody, apiHandler, apiJson, conflict, invalid, notFound } from "@/lib/api/errors";
import { matchPolicy, submitForApprovalCore } from "@/lib/approvals";
import { scheduleItemCore } from "@/lib/publishing/schedule";
import { utcToZonedInput } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO 8601 timestamp");
const bodySchema = z.object({
  scheduledAt: isoDate.optional(),
  /** Ask a specific person to review; otherwise the policy's approver roles are notified. */
  assigneeUserId: z.string().optional(),
  note: z.string().max(1000).optional(),
});

/**
 * POST /api/v1/drafts/{id}/submit — the human gate.
 *
 * With an approval policy in play (or the item already in review) this opens
 * an approval request and a person decides; `scheduledAt` is remembered and
 * applied on approval. With no policy, a key scoped for content.publish may
 * schedule the given time directly — exactly what that person could do in the UI.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiHandler(async () => {
    const ctx = await authenticateApi(req);
    const { id } = await params;
    const parsed = bodySchema.safeParse(await apiBody(req).catch(() => ({})));
    if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? "Invalid submission.");
    const { scheduledAt, assigneeUserId, note } = parsed.data;

    const item = await db.query.contentItem.findFirst({ where: (c, { and, eq, isNull }) => and(eq(c.id, id), eq(c.workspaceId, ctx.workspaceId), isNull(c.deletedAt)) });
    if (!item) throw notFound("Draft not found.");
    const at = scheduledAt ? new Date(scheduledAt) : null;

    const policy = await matchPolicy({ workspaceId: ctx.workspaceId, itemId: item.id, authorRole: ctx.role, campaignId: item.campaignId });
    const inReview = item.approvalState === "pending" || item.approvalState === "changes_requested";
    const needsApproval = inReview || (Boolean(policy) && item.approvalState !== "approved");

    if (!needsApproval && at) {
      requireScope(ctx, "content.publish", { policyAllows: true });
      const actor = { userId: ctx.actorUserId, organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, role: ctx.role };
      const r = await scheduleItemCore(actor, item.id, at, "api:submit");
      if (r.error) throw conflict(r.error);
      return apiJson({ status: "scheduled", itemId: item.id, scheduledAt: r.at?.toISOString() ?? null, channels: r.channels ?? 0 });
    }

    requireScope(ctx, "content.edit");
    if (item.approvalState === "pending") throw conflict("This post is already waiting for approval.");
    const actor = { userId: ctx.actorUserId, userName: ctx.keyName, organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, role: ctx.role };
    // scheduleOnApprove is a workspace-local time: decideRequest re-reads it in the workspace timezone.
    const r = await submitForApprovalCore(actor, { itemId: item.id, assigneeUserId, note, scheduleOnApprove: at ? utcToZonedInput(at, ctx.timezone) : null }, "api:submit");
    if (r.error) throw conflict(r.error);
    return apiJson({
      status: "pending_approval",
      itemId: item.id,
      requestId: r.requestId,
      policy: r.policyName,
      scheduleOnApprove: at?.toISOString() ?? null,
      note: "A person decides. Nothing is sent to a network until they approve.",
    });
  });
}
