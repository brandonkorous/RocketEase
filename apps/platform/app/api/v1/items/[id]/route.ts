import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { channel } from "@/db/schema/connections";
import { postVariant, publishJob } from "@/db/schema/content";
import { authenticateApi } from "@/lib/api/auth";
import { apiHandler, apiJson, notFound } from "@/lib/api/errors";
import { itemView, receiptView } from "@/lib/api/serialize";
import { loadReceipts } from "@/lib/publishing/receipt-load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/items/{id} — state plus the publish receipt for every destination. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiHandler(async () => {
    const ctx = await authenticateApi(req);
    const { id } = await params;
    const item = await db.query.contentItem.findFirst({ where: (c, { and, eq, isNull }) => and(eq(c.id, id), eq(c.workspaceId, ctx.workspaceId), isNull(c.deletedAt)) });
    if (!item) throw notFound("Item not found.");
    const variants = await db.select().from(postVariant).where(eq(postVariant.contentItemId, item.id));
    const channels = variants.length ? await db.select({ id: channel.id, name: channel.name, network: channel.network }).from(channel).where(inArray(channel.id, variants.map((v) => v.channelId))) : [];
    const jobs = variants.length ? await db.select().from(publishJob).where(inArray(publishJob.variantId, variants.map((v) => v.id))) : [];
    const names = new Map(channels.map((c) => [c.id, c.name]));
    const rows = variants.map((v) => ({ v, ch: channels.find((c) => c.id === v.channelId) ?? { name: "Unknown channel", network: "unknown" } }));
    const receipts = await loadReceipts(item, rows, jobs);
    return apiJson({ item: itemView(item, variants, names), receipts: receipts.map(receiptView) });
  });
}
