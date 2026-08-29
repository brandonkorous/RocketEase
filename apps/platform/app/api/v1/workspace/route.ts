import { authenticateApi } from "@/lib/api/auth";
import { apiHandler, apiJson } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/workspace — who this key is, and exactly what it may do. */
export async function GET(req: Request) {
  return apiHandler(async () => {
    const ctx = await authenticateApi(req);
    return apiJson({
      workspace: { id: ctx.workspaceId, name: ctx.workspaceName, timezone: ctx.timezone, organizationId: ctx.organizationId },
      key: { name: ctx.keyName, scopes: ctx.scopes },
      actor: { userId: ctx.actorUserId, role: ctx.role, grants: ctx.grants },
      /* The API never bypasses a gate the UI applies. */
      gates: {
        publishing: "Drafts are created unpublished. Scheduling requires the content.publish scope and passes the workspace's approval policies.",
        approvals: "Submitting routes through the same approval policy a person would hit; a person decides.",
        replies: "Replies created here are drafts. A person sends them from the Inbox.",
        paidSpend: "Paid spend is not exposed by this API.",
      },
    });
  });
}
