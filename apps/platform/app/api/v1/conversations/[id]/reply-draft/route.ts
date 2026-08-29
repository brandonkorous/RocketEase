import { z } from "zod";
import { authenticateApi, idempotencyKey, requireScope } from "@/lib/api/auth";
import { apiBody, apiHandler, apiJson, conflict, invalid } from "@/lib/api/errors";
import { draftReply } from "@/lib/engagement/reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ text: z.string().min(1, "Write a reply first.").max(5000) });

/**
 * POST /api/v1/conversations/{id}/reply-draft — propose a reply.
 *
 * The message is written in the `draft` delivery state and appears in the
 * Inbox thread with a Send button. Nothing is queued and no provider is
 * called until a person presses it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiHandler(async () => {
    const ctx = await authenticateApi(req);
    requireScope(ctx, "conversations.handle");
    const { id } = await params;
    const parsed = bodySchema.safeParse(await apiBody(req));
    if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? "Invalid reply.");
    const idem = idempotencyKey(ctx, req);
    const r = await draftReply({ userId: ctx.actorUserId, organizationId: ctx.organizationId, workspaceId: ctx.workspaceId }, id, parsed.data.text, idem, "api:replyDraft");
    if (r.error) throw conflict(r.error);
    return apiJson(
      { messageId: r.messageId, deliveryState: "draft", idempotentReplay: Boolean(r.existing), note: "A person sends this from the Inbox." },
      r.existing ? 200 : 201,
    );
  });
}
