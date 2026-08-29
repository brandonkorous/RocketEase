import { eq } from "drizzle-orm";
import type { WebhookEvent } from "@rocketease/providers";
import { db } from "@/db";
import { webhookReceipt } from "@/db/schema/connections";
import { ingestItems } from "@/lib/engagement/ingest";
import type { JobPayloads } from "@/lib/jobs/queues";
import { getAdapter } from "@/lib/providers";
import type { HandlerContext } from "./index";

/**
 * Turn a stored webhook receipt into inbox items for every workspace channel
 * that maps to the remote id. Receipts are unique per provider event, so a
 * redelivery never double-ingests.
 */
export async function webhookProcess(data: JobPayloads["webhook.process"], ctx: HandlerContext) {
  const receipt = await db.query.webhookReceipt.findFirst({ where: (r, { eq }) => eq(r.id, data.receiptId) });
  if (!receipt || receipt.processedAt) return;
  const event = receipt.payload as WebhookEvent;
  const l = ctx.log.child({ receiptId: receipt.id, provider: receipt.provider, kind: event.kind });
  try {
    const adapter = getAdapter(receipt.provider);
    const items = adapter.inboxItemsFromWebhook?.(event) ?? null;
    if (items?.length && receipt.channelRemoteId) {
      const channels = await db.query.channel.findMany({ where: (c, { and, eq }) => and(eq(c.provider, receipt.provider), eq(c.remoteId, receipt.channelRemoteId!)) });
      let created = 0;
      for (const ch of channels) if (ch.status !== "disconnected") created += await ingestItems(ch, items);
      l.info("webhook ingested", { channels: channels.length, created });
    } else {
      l.info("webhook ignored (not an inbox event)");
    }
    await db.update(webhookReceipt).set({ processedAt: new Date(), error: null }).where(eq(webhookReceipt.id, receipt.id));
  } catch (err) {
    await db.update(webhookReceipt).set({ error: String(err) }).where(eq(webhookReceipt.id, receipt.id));
    throw err;
  }
}
