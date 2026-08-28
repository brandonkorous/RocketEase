import { eq, sql } from "drizzle-orm";
import { ProviderError, type PromotionResult } from "@make-it-social/providers";
import { db } from "@/db";
import { campaignEvent, promotion, type Promotion } from "@/db/schema/campaigns";
import { audit } from "@/lib/audit";
import { toAccountDescriptor, upsertPaidObjects } from "@/lib/campaigns/paid-import";
import type { JobPayloads } from "@/lib/jobs/queues";
import { workspacePath } from "@/lib/nav";
import { notify } from "@/lib/notifications";
import { getAdapter, loadCredential } from "@/lib/providers";
import type { HandlerContext } from "./index";

const RETRYABLE = new Set(["temporary", "rate_limit"]);
const href = (p: Promotion) => workspacePath(p.workspaceId, p.campaignId ? `campaigns/${p.campaignId}?tab=ads` : "campaigns");

async function markCreated(p: Promotion, r: PromotionResult) {
  await db.update(promotion).set({ status: "created", campaignRemoteId: r.campaignRemoteId, adSetRemoteId: r.adSetRemoteId, adRemoteId: r.adRemoteId, managerUrl: r.managerUrl ?? null, error: null, updatedAt: new Date() }).where(eq(promotion.id, p.id));
  if (p.campaignId) await db.insert(campaignEvent).values({ workspaceId: p.workspaceId, campaignId: p.campaignId, kind: "promotion_created", actorUserId: p.confirmedByUserId, data: { promotionId: p.id, campaignRemoteId: r.campaignRemoteId, status: r.status } });
  await audit({ action: "promotion.created", actorUserId: p.confirmedByUserId, organizationId: p.organizationId, workspaceId: p.workspaceId, targetType: "promotion", targetId: p.id, summary: { after: { campaignRemoteId: r.campaignRemoteId, adRemoteId: r.adRemoteId, status: r.status } } });
  await notify({ workspaceId: p.workspaceId, organizationId: p.organizationId, userId: p.confirmedByUserId, kind: "promotion.created", title: `Promotion "${p.request.name}" was created (${r.status})`, body: r.status === "paused" ? "It is paused in the ad account until you switch it on." : "It is live in the ad account.", href: href(p) });
}

async function markFailed(p: Promotion, reason: string) {
  await db.update(promotion).set({ status: "failed", error: reason, updatedAt: new Date() }).where(eq(promotion.id, p.id));
  if (p.campaignId) await db.insert(campaignEvent).values({ workspaceId: p.workspaceId, campaignId: p.campaignId, kind: "promotion_failed", actorUserId: p.confirmedByUserId, data: { promotionId: p.id, reason } });
  await audit({ action: "promotion.failed", actorUserId: p.confirmedByUserId, organizationId: p.organizationId, workspaceId: p.workspaceId, targetType: "promotion", targetId: p.id, summary: { note: reason }, result: "error" });
  await notify({ workspaceId: p.workspaceId, organizationId: p.organizationId, userId: p.confirmedByUserId, kind: "promotion.failed", title: "A promotion could not be created", body: reason, href: href(p) });
}

/** Pull the freshly created objects so the Ads tab shows them without waiting for the next sync. */
async function importNow(p: Promotion) {
  const account = await db.query.adAccount.findFirst({ where: (a, { eq }) => eq(a.id, p.adAccountId) });
  const conn = account && (await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, account.connectionId) }));
  const adapter = conn && getAdapter(conn.provider);
  if (!account || !conn || !adapter?.fetchPaidObjects) return;
  await upsertPaidObjects(account, await adapter.fetchPaidObjects(await loadCredential(conn), toAccountDescriptor(account))).catch(() => undefined);
}

/**
 * CAM-002: the promotion row already carries the user's explicit confirmation.
 * An ambiguous provider outcome is reconciled (findPromotion by idempotency
 * key) before anything is created again; non-retryable categories fail fast.
 */
export async function promotionExecute(data: JobPayloads["promotion.execute"], ctx: HandlerContext) {
  const p = await db.query.promotion.findFirst({ where: (x, { eq }) => eq(x.id, data.promotionId) });
  if (!p || p.status === "created" || p.status === "failed") return;
  const account = await db.query.adAccount.findFirst({ where: (a, { eq }) => eq(a.id, p.adAccountId) });
  const conn = account && (await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, account.connectionId) }));
  if (!account || !conn || conn.status !== "active") return markFailed(p, "The ad account's connection is no longer active. Reconnect it and confirm the promotion again.");
  const adapter = getAdapter(conn.provider);
  if (!adapter.promote) return markFailed(p, "This network does not support promotions from Make It Social.");
  const l = ctx.log.child({ promotionId: p.id });
  const cred = await loadCredential(conn);
  const desc = toAccountDescriptor(account);

  if (p.status === "ambiguous") {
    const found = await adapter.findPromotion?.(cred, desc, p.idempotencyKey);
    if (found) { l.info("ambiguous promotion reconciled as created"); await markCreated(p, found); return importNow(p); }
    l.info("ambiguous promotion not found remotely; creating again with the same key");
  }

  await db.update(promotion).set({ status: "creating", attempts: sql`${promotion.attempts} + 1`, updatedAt: new Date() }).where(eq(promotion.id, p.id));
  try {
    const r = await adapter.promote(cred, desc, { ...p.request, idempotencyKey: p.idempotencyKey });
    await markCreated(p, r);
    await importNow(p);
    l.info("promotion created", { campaignRemoteId: r.campaignRemoteId });
  } catch (err) {
    if (!(err instanceof ProviderError)) { await db.update(promotion).set({ status: "queued", error: String(err) }).where(eq(promotion.id, p.id)); throw err; }
    if (err.ambiguous) {
      await db.update(promotion).set({ status: "ambiguous", error: err.message }).where(eq(promotion.id, p.id));
      const found = await adapter.findPromotion?.(cred, desc, p.idempotencyKey);
      if (found) { l.info("promotion reconciled after ambiguous error"); await markCreated(p, found); return importNow(p); }
      throw err; // retry → reconcile first
    }
    if (RETRYABLE.has(err.category) && p.attempts < 3) { await db.update(promotion).set({ status: "queued", error: err.message }).where(eq(promotion.id, p.id)); throw err; }
    await markFailed(p, err.message);
    l.warn("promotion failed", { category: err.category });
  }
}
