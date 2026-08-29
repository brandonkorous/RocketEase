/*
 * "Clocks" strip for campaign detail: every rights clock attached to a post
 * this campaign promotes, soonest first.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import { promotion } from "@/db/schema/campaigns";
import { contentItem, postVariant } from "@/db/schema/content";
import { formatInZone } from "@/lib/time";
import { grantsForUse } from "./queries";
import { daysUntil, remainingLabel } from "./format";
import { KIND_LABEL, SCOPE_LABEL, WARN_DAYS, type RightsScope } from "./types";

export type ClockRow = {
  id: string; what: string; subject: string; scopeLabel: string;
  remaining: string; expiresLabel: string; state: "ok" | "warning" | "expired" | "revoked";
};

const state = (expiresAt: Date, revoked: boolean, now: Date): ClockRow["state"] => {
  if (revoked) return "revoked";
  const d = daysUntil(expiresAt, now);
  return d < 0 ? "expired" : d <= WARN_DAYS ? "warning" : "ok";
};

/** Promoted posts in this campaign, with the assets and channels they use. */
async function promotedUses(workspaceId: string, campaignId: string) {
  return db
    .select({ title: contentItem.title, channelId: promotion.channelId, override: postVariant.assetIdsOverride, shared: contentItem.sharedAssetIds })
    .from(promotion)
    .innerJoin(postVariant, eq(postVariant.id, promotion.variantId))
    .innerJoin(contentItem, eq(contentItem.id, postVariant.contentItemId))
    .where(and(eq(promotion.workspaceId, workspaceId), eq(promotion.campaignId, campaignId), inArray(promotion.status, ["queued", "creating", "created", "ambiguous"])));
}

export async function campaignClocks(workspaceId: string, campaignId: string, tz: string, now = new Date()): Promise<ClockRow[]> {
  const uses = await promotedUses(workspaceId, campaignId);
  if (uses.length === 0) return [];
  const assetIds = [...new Set(uses.flatMap((u) => u.override ?? u.shared))];
  const channelIds = [...new Set(uses.map((u) => u.channelId))];
  const [assets, grants] = await Promise.all([
    assetIds.length ? db.select().from(asset).where(and(inArray(asset.id, assetIds), isNull(asset.deletedAt))) : Promise.resolve([]),
    Promise.all(channelIds.map((c) => grantsForUse(workspaceId, assetIds, c))).then((r) => r.flat()),
  ]);
  const label = (d: Date) => formatInZone(d, tz, { month: "short", day: "numeric", year: "numeric" });
  const rows: ClockRow[] = [];
  for (const a of assets) {
    if (!a.rightsExpiresAt) continue;
    const use = uses.find((u) => (u.override ?? u.shared).includes(a.id));
    rows.push({ id: `asset:${a.id}`, what: `Usage rights · ${a.fileName}`, subject: use ? use.title : "Promoted post", scopeLabel: SCOPE_LABEL[a.rightsScope as RightsScope], remaining: remainingLabel(a.rightsExpiresAt, now), expiresLabel: label(a.rightsExpiresAt), state: state(a.rightsExpiresAt, false, now) });
  }
  const seen = new Set<string>();
  for (const g of grants) {
    if (!g.expiresAt || seen.has(g.id)) continue;
    seen.add(g.id);
    rows.push({ id: `grant:${g.id}`, what: `${KIND_LABEL[g.kind]} · ${g.label}`, subject: g.creatorHandle ?? "Attached to a promoted post", scopeLabel: SCOPE_LABEL[g.scope], remaining: remainingLabel(g.expiresAt, now), expiresLabel: label(g.expiresAt), state: state(g.expiresAt, Boolean(g.revokedAt), now) });
  }
  const rank = { revoked: 0, expired: 1, warning: 2, ok: 3 };
  return rows.sort((a, b) => rank[a.state] - rank[b.state] || a.expiresLabel.localeCompare(b.expiresLabel));
}
