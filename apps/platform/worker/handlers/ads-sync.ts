import { eq } from "drizzle-orm";
import { ProviderError } from "@make-it-social/providers";
import { db } from "@/db";
import { adAccount, adCreative, adCampaign } from "@/db/schema/campaigns";
import type { JobPayloads } from "@/lib/jobs/queues";
import { toAccountDescriptor, upsertPaidFacts, upsertPaidObjects } from "@/lib/campaigns/paid-import";
import { getAdapter, loadCredential } from "@/lib/providers";
import type { HandlerContext } from "./index";

const LOOKBACK_DAYS = 3; // providers restate recent spend/conversions; always re-pull a short tail
const INITIAL_DAYS = 28;
const dayStr = (d: Date) => d.toISOString().slice(0, 10);

/** Ads whose creative boosts an organic post → ad remote id → post remote id (for post-level paid facts). */
async function promotedPostMap(accountId: string) {
  const rows = await db.select({ ad: adCreative.remoteId, post: adCreative.promotedPostRemoteId }).from(adCreative).innerJoin(adCampaign, eq(adCampaign.id, adCreative.adCampaignId)).where(eq(adCampaign.adAccountId, accountId));
  return new Map(rows.filter((r): r is { ad: string; post: string } => !!r.post).map((r) => [r.ad, r.post]));
}

/** Read-only import: paid objects + daily facts for one ad account (6.3). Never mutates anything remotely. */
export async function adsSync(data: JobPayloads["ads.sync"], ctx: HandlerContext) {
  const account = await db.query.adAccount.findFirst({ where: (a, { eq }) => eq(a.id, data.adAccountId) });
  if (!account || account.disconnectedAt) return;
  const conn = await db.query.providerConnection.findFirst({ where: (c, { eq }) => eq(c.id, account.connectionId) });
  if (!conn || conn.status !== "active") return;
  const adapter = getAdapter(conn.provider);
  if (!adapter.fetchPaidObjects || !adapter.fetchPaidInsights) return;
  const l = ctx.log.child({ adAccountId: account.id });
  const until = new Date();
  const since = data.since ? new Date(data.since) : account.lastSyncAt ? new Date(account.lastSyncAt.getTime() - LOOKBACK_DAYS * 86_400_000) : new Date(until.getTime() - INITIAL_DAYS * 86_400_000);
  try {
    const cred = await loadCredential(conn);
    const desc = toAccountDescriptor(account);
    const objects = await adapter.fetchPaidObjects(cred, desc);
    const counts = await upsertPaidObjects(account, objects);
    const postByAd = await promotedPostMap(account.id);
    let facts = { inserted: 0, revised: 0 };
    if (account.channelId) {
      const page = await adapter.fetchPaidInsights(cred, desc, { since: dayStr(since), until: dayStr(until), levels: postByAd.size ? ["campaign", "ad"] : ["campaign"] });
      facts = await upsertPaidFacts({ ...account, channelId: account.channelId }, page, postByAd);
    }
    await db.update(adAccount).set({ lastSyncAt: until, lastError: account.channelId ? null : "No channel is linked to this ad account, so spend is imported without facts.", updatedAt: until }).where(eq(adAccount.id, account.id));
    l.info("ads synced", { ...counts, ...facts });
  } catch (err) {
    const msg = err instanceof ProviderError ? `${err.category}: ${err.message}` : String(err);
    await db.update(adAccount).set({ lastError: msg, updatedAt: new Date() }).where(eq(adAccount.id, account.id));
    if (err instanceof ProviderError && err.category === "permission") { l.warn("ads sync lost permission", { err: msg }); return; }
    throw err;
  }
}
