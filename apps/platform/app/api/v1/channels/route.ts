import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { channel } from "@/db/schema/connections";
import { authenticateApi } from "@/lib/api/auth";
import { apiHandler, apiJson } from "@/lib/api/errors";
import { channelView } from "@/lib/api/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POSTABLE = ["healthy", "degraded", "syncing", "action_required"] as const;

/** GET /api/v1/channels — connected accounts with their live capabilities. */
export async function GET(req: Request) {
  return apiHandler(async () => {
    const ctx = await authenticateApi(req);
    const includeAll = new URL(req.url).searchParams.get("include") === "all";
    const rows = await db
      .select()
      .from(channel)
      .where(includeAll ? eq(channel.workspaceId, ctx.workspaceId) : and(eq(channel.workspaceId, ctx.workspaceId), inArray(channel.status, [...POSTABLE])))
      .orderBy(channel.name);
    return apiJson({ channels: rows.map(channelView) });
  });
}
