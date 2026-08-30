/*
 * Blast-radius limits, wired to the environment and the ledger.
 *
 * The decision itself is pure and lives in ./ceiling-policy; this file only
 * supplies what it needs. Checked BEFORE any adapter call, so a refusal costs
 * nothing.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import type { CostEstimate } from "@rocketease/media";
import { db } from "@/db";
import { mediaJob } from "@/db/schema/media";
import { decideCeiling, parseCeiling, startOfMonth, type CeilingCheck } from "./ceiling-policy";

export { startOfMonth, type CeilingCheck, type CeilingRefusal } from "./ceiling-policy";

export const perJobCeiling = () => parseCeiling(process.env.MEDIA_CEILING_USD_PER_JOB);
export const perOrgMonthCeiling = () => parseCeiling(process.env.MEDIA_CEILING_USD_PER_ORG_MONTH);

/** What this organization has actually been charged since the given instant. */
export async function spentSince(organizationId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${mediaJob.vendorCostUsd}), 0)` })
    .from(mediaJob)
    .where(and(eq(mediaJob.organizationId, organizationId), gte(mediaJob.createdAt, since)));
  const n = Number(row?.total ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function checkCeiling(organizationId: string, estimate: CostEstimate, now = new Date()): Promise<CeilingCheck> {
  const perJob = perJobCeiling();
  const perMonth = perOrgMonthCeiling();
  // Skip the query entirely when no monthly limit can refuse anything.
  const spentThisMonth = perMonth === null ? 0 : await spentSince(organizationId, startOfMonth(now));
  return decideCeiling(estimate, { perJob, perMonth, spentThisMonth });
}
