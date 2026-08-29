import { authenticateApi, requireScope } from "@/lib/api/auth";
import { apiHandler, apiJson, invalid } from "@/lib/api/errors";
import { listConversations, type InboxFilters, type InboxTab } from "@/lib/engagement/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["open", "snoozed", "resolved", "all"] as const;
const TABS: InboxTab[] = ["all", "unread", "mentions", "dms", "comments"];

/** GET /api/v1/conversations?status=open&tab=all&channelId=&q=&limit= */
export async function GET(req: Request) {
  return apiHandler(async () => {
    const ctx = await authenticateApi(req);
    requireScope(ctx, "conversations.handle");
    const p = new URL(req.url).searchParams;
    const status = (p.get("status") ?? "open") as InboxFilters["status"];
    if (!(STATUSES as readonly string[]).includes(status)) throw invalid(`status must be one of ${STATUSES.join(", ")}.`);
    const tab = (p.get("tab") ?? "all") as InboxTab;
    if (!TABS.includes(tab)) throw invalid(`tab must be one of ${TABS.join(", ")}.`);
    const limit = Math.min(Math.max(Number(p.get("limit") ?? 50) || 50, 1), 100);
    const filters: InboxFilters = { tab, status, channel: p.get("channelId") ?? "", assignee: p.get("assignee") ?? "", sort: "newest", q: p.get("q") ?? "" };

    const { rows, counts } = await listConversations(ctx.workspaceId, ctx.actorUserId, filters, ctx.timezone, limit);
    return apiJson({
      counts,
      conversations: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        priority: r.priority,
        preview: r.preview,
        unread: r.unread,
        overdue: r.overdue,
        lastMessageAt: r.lastMessageAt,
        contact: { id: r.contact.id, name: r.contact.name, handle: r.contact.handle },
        channel: r.channel,
        assignee: r.assignee,
      })),
    });
  });
}
