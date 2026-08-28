/*
 * Paid actions. Pausing is the only spend mutation an automation may make, and
 * it always passes through the approval gate first (capabilities.ts) — a rule
 * can stop money going out, never start it.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { adAccount, adCampaign, campaignEvent, promotion } from "@/db/schema/campaigns";
import type { ActionOutcome, RuleAction } from "@/db/schema/automations";
import { toAccountDescriptor } from "@/lib/campaigns/paid-import";
import { getAdapter, loadCredential } from "@/lib/providers";
import type { ApplyContext } from "./types";

const skip = (kind: RuleAction["kind"], detail: string): ActionOutcome => ({ kind, status: "skipped", detail });

/** Ad campaigns created by a promotion of this post variant. */
async function adsForVariant(variantId: string) {
  const promos = await db.select({ id: promotion.id }).from(promotion).where(and(eq(promotion.variantId, variantId), eq(promotion.status, "created")));
  if (!promos.length) return [];
  return db.select().from(adCampaign).where(inArray(adCampaign.promotionId, promos.map((p) => p.id)));
}

const adsForCampaign = (campaignId: string) => db.select().from(adCampaign).where(eq(adCampaign.campaignId, campaignId));

/** Pause one ad campaign remotely, then mirror the status locally. Returns null on success. */
async function pauseOne(row: typeof adCampaign.$inferSelect, ruleName: string): Promise<string | null> {
  if (row.status === "paused") return null;
  const account = await db.query.adAccount.findFirst({ where: (a, { eq }) => eq(a.id, row.adAccountId) });
  const conn = account && (await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, account.connectionId) }));
  if (!account || !conn) return `${row.name}: the ad account is disconnected`;
  const adapter = getAdapter(conn.provider);
  if (!adapter.setPaidObjectStatus) return `${row.name}: ${adapter.displayName} is read-only here — pause it in the native manager`;
  await adapter.setPaidObjectStatus(await loadCredential(conn), toAccountDescriptor(account), row.remoteId, "paused");
  await db.update(adCampaign).set({ status: "paused", updatedAt: new Date() }).where(eq(adCampaign.id, row.id));
  if (row.campaignId) await db.insert(campaignEvent).values({ workspaceId: row.workspaceId, campaignId: row.campaignId, kind: "ad_campaign_status", data: { adCampaignId: row.id, name: row.name, status: "paused", rule: ruleName } });
  return null;
}

export async function applyAdsAction(c: ApplyContext, a: RuleAction): Promise<ActionOutcome> {
  const kind = a.kind;
  if (kind !== "campaign.pause_promotion" && kind !== "campaign.pause_ads") return skip(kind, "not a paid action");
  const rows =
    kind === "campaign.pause_promotion"
      ? c.subject.ctx.variantId
        ? await adsForVariant(c.subject.ctx.variantId)
        : []
      : c.subject.ctx.campaignId
        ? await adsForCampaign(c.subject.ctx.campaignId)
        : [];
  const live = rows.filter((r) => r.status !== "paused");
  if (!rows.length) return skip(kind, "no ad campaign is linked to this event");
  if (!live.length) return { kind, status: "applied", detail: "already paused" };

  const problems: string[] = [];
  let paused = 0;
  for (const row of live) {
    try {
      const err = await pauseOne(row, c.rule.name);
      if (err) problems.push(err);
      else paused++;
    } catch (err) {
      problems.push(`${row.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const detail = `${paused} of ${live.length} paused${problems.length ? ` — ${problems.join("; ")}` : ""}`;
  return { kind, status: paused === 0 ? "failed" : "applied", detail };
}
