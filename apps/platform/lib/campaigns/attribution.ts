/*
 * Paid attribution provenance (analytics.md): always show model, window,
 * source, currency and freshness next to conversion numbers.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { adAccount } from "@/db/schema/campaigns";
import { formatInZone } from "@/lib/time";

export type PaidAttribution = { model: string; window: string; sources: string[]; currency: string; freshLabel: string | null };

const PROVIDER_ATTRIBUTION: Record<string, { model: string; window: string; source: string }> = {
  mock: { model: "provider-reported (last click)", window: "7-day click, 1-day view", source: "Demo ads" },
  meta: { model: "Meta-reported (last touch)", window: "7-day click, 1-day view", source: "Meta Marketing API" },
};

/** How paid conversions in this workspace were attributed, from the connected ad accounts. */
export async function paidAttribution(workspaceId: string, tz = "UTC"): Promise<PaidAttribution | null> {
  const accounts = await db.select({ provider: adAccount.provider, currency: adAccount.currency, lastSyncAt: adAccount.lastSyncAt }).from(adAccount).where(and(eq(adAccount.workspaceId, workspaceId), isNull(adAccount.disconnectedAt))).orderBy(desc(adAccount.lastSyncAt));
  if (!accounts.length) return null;
  const infos = accounts.map((a) => PROVIDER_ATTRIBUTION[a.provider] ?? { model: "provider-reported", window: "provider default", source: a.provider });
  const currencies = [...new Set(accounts.map((a) => a.currency))];
  const latest = accounts.find((a) => a.lastSyncAt)?.lastSyncAt ?? null;
  return { model: [...new Set(infos.map((i) => i.model))].join(" / "), window: [...new Set(infos.map((i) => i.window))].join(" / "), sources: [...new Set(infos.map((i) => i.source))], currency: currencies.length === 1 ? currencies[0] : `mixed (${currencies.join(", ")})`, freshLabel: latest ? formatInZone(latest, tz) : null };
}

