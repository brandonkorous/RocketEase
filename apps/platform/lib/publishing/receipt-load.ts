/*
 * Loads everything buildReceipt needs for one item's destinations: variant
 * state, every publish attempt, the approval that let it out, and what the
 * nightly reconcile last saw at the network.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { remotePublication, type ContentItem, type PostVariant, type PublishJobRow } from "@/db/schema/content";
import { buildReceipt, type PublishReceipt } from "./receipt";

/** Publish receipts for every destination: variant state + jobs + what the nightly reconcile saw. */
export async function loadReceipts(item: ContentItem, rows: { v: PostVariant; ch: { name: string; network: string } }[], jobs: PublishJobRow[]): Promise<PublishReceipt[]> {
  const ids = rows.map((r) => r.v.id);
  const [pubs, approval] = await Promise.all([
    ids.length ? db.select().from(remotePublication).where(inArray(remotePublication.variantId, ids)) : Promise.resolve([]),
    db.query.approvalRequest.findFirst({
      where: (r, { and, eq }) => and(eq(r.contentItemId, item.id), eq(r.state, "approved")),
      orderBy: (r, { desc }) => desc(r.decidedAt),
    }),
  ]);
  return rows.map(({ v, ch }) =>
    buildReceipt({
      variant: v,
      channel: ch,
      jobs: jobs.filter((j) => j.variantId === v.id),
      approvedAt: item.approvalState === "approved" ? (approval?.decidedAt ?? null) : null,
      publication: pubs.find((p) => p.variantId === v.id) ?? null,
    }),
  );
}
