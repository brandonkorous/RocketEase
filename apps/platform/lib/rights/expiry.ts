/*
 * Nightly sweep: warn before a rights or authorisation clock runs out on
 * something already scheduled or promoted. Silent for clocks nothing uses.
 */
import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { asset } from "@/db/schema/assets";
import { promotion } from "@/db/schema/campaigns";
import { contentItem, postVariant } from "@/db/schema/content";
import { authorizationGrant } from "@/db/schema/rights";
import { workspacePath } from "@/lib/nav";
import { notify } from "@/lib/notifications";
import { daysUntil, day } from "./format";
import { KIND_LABEL, WARN_DAYS } from "./types";

/** Only these day marks notify, so a nightly sweep can't nag every night. */
export const NOTIFY_DAYS = [7, 3, 1];

export type PendingUse = { workspaceId: string; assetIds: string[]; channelId: string; label: string };

/** Scheduled posts and live promotions — the uses a lapsing clock would break. */
export async function pendingUses(now: Date): Promise<PendingUse[]> {
  const scheduled = await db
    .select({ workspaceId: postVariant.workspaceId, channelId: postVariant.channelId, override: postVariant.assetIdsOverride, shared: contentItem.sharedAssetIds, title: contentItem.title })
    .from(postVariant)
    .innerJoin(contentItem, eq(contentItem.id, postVariant.contentItemId))
    .where(and(eq(postVariant.status, "scheduled"), gt(postVariant.scheduledAt, now)));
  const promoted = await db
    .select({ workspaceId: promotion.workspaceId, channelId: promotion.channelId, override: postVariant.assetIdsOverride, shared: contentItem.sharedAssetIds, title: contentItem.title })
    .from(promotion)
    .innerJoin(postVariant, eq(postVariant.id, promotion.variantId))
    .innerJoin(contentItem, eq(contentItem.id, postVariant.contentItemId))
    .where(inArray(promotion.status, ["queued", "creating", "created"]));
  return [
    ...scheduled.map((r) => ({ workspaceId: r.workspaceId, channelId: r.channelId, assetIds: r.override ?? r.shared, label: `scheduled post "${r.title}"` })),
    ...promoted.map((r) => ({ workspaceId: r.workspaceId, channelId: r.channelId, assetIds: r.override ?? r.shared, label: `promoted post "${r.title}"` })),
  ];
}

type Clock = { organizationId: string; workspaceId: string; what: string; expiresAt: Date; href: string; use: string };

async function assetClocks(now: Date, until: Date, uses: PendingUse[]): Promise<Clock[]> {
  const rows = await db
    .select({ id: asset.id, organizationId: asset.organizationId, workspaceId: asset.workspaceId, fileName: asset.fileName, expiresAt: asset.rightsExpiresAt })
    .from(asset)
    .where(and(isNull(asset.deletedAt), gt(asset.rightsExpiresAt, now), lte(asset.rightsExpiresAt, until)));
  return rows.flatMap((a) => {
    const use = uses.find((u) => u.workspaceId === a.workspaceId && u.assetIds.includes(a.id));
    if (!use || !a.expiresAt) return [];
    return [{ organizationId: a.organizationId, workspaceId: a.workspaceId, what: `Usage rights for ${a.fileName}`, expiresAt: a.expiresAt, href: workspacePath(a.workspaceId, "content?smart=expiring"), use: use.label }];
  });
}

async function grantClocks(now: Date, until: Date, uses: PendingUse[]): Promise<Clock[]> {
  const rows = await db
    .select()
    .from(authorizationGrant)
    .where(and(isNull(authorizationGrant.revokedAt), gt(authorizationGrant.expiresAt, now), lte(authorizationGrant.expiresAt, until)));
  return rows.flatMap((g) => {
    const use = uses.find((u) => u.workspaceId === g.workspaceId && ((g.assetId && u.assetIds.includes(g.assetId)) || (g.channelId && u.channelId === g.channelId)));
    if (!use || !g.expiresAt) return [];
    return [{ organizationId: g.organizationId, workspaceId: g.workspaceId, what: `${KIND_LABEL[g.kind]} "${g.label}"`, expiresAt: g.expiresAt, href: workspacePath(g.workspaceId, "settings/rights"), use: use.label }];
  });
}

/** Notifies owners/admins/managers once at 7, 3 and 1 days out. Returns how many it sent. */
export async function sweepExpiringClocks(now = new Date()): Promise<number> {
  const until = new Date(now.getTime() + WARN_DAYS * 86_400_000);
  const uses = await pendingUses(now);
  if (uses.length === 0) return 0;
  const clocks = [...(await assetClocks(now, until, uses)), ...(await grantClocks(now, until, uses))];
  let sent = 0;
  for (const c of clocks) {
    const left = daysUntil(c.expiresAt, now);
    if (!NOTIFY_DAYS.includes(left)) continue;
    await notify({
      workspaceId: c.workspaceId,
      organizationId: c.organizationId,
      userId: null,
      kind: "rights.expiring",
      title: `${c.what} expires in ${left} day${left === 1 ? "" : "s"}`,
      body: `It runs out on ${day(c.expiresAt)} and still covers a ${c.use}. Renew it, or change the post before that date.`,
      href: c.href,
    });
    sent += 1;
  }
  return sent;
}
