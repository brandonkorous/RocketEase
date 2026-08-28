/*
 * Persistence for recommendations: upsert what this run found (dedupe on
 * kind + target), drop open rows the rules no longer produce, and expire
 * everything after the TTL so a stale suggestion can never linger.
 */
import { and, eq, gt, inArray, lt, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { recommendation, type Recommendation } from "@/db/schema/recommendations";
import { log } from "@/lib/log";
import type { RecommendationDraft } from "./types";

export const TTL_DAYS = 14;

const key = (d: { kind: string; target: string }) => `${d.kind}:${d.target}`;

/** Upsert drafts; a user decision (dismissed/applied) survives until the row expires. */
export async function persistDrafts(organizationId: string, workspaceId: string, drafts: RecommendationDraft[]) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_DAYS * 86_400_000);
  for (const d of drafts) {
    await db
      .insert(recommendation)
      .values({ organizationId, workspaceId, kind: d.kind, target: d.target, title: d.title, body: d.body, evidence: d.evidence, confidence: d.confidence, action: d.action ?? null, channelId: d.channelId ?? null, contentItemId: d.contentItemId ?? null, computedAt: now, expiresAt })
      .onConflictDoUpdate({
        target: [recommendation.workspaceId, recommendation.kind, recommendation.target],
        set: { title: d.title, body: d.body, evidence: d.evidence, confidence: d.confidence, action: d.action ?? null, channelId: d.channelId ?? null, contentItemId: d.contentItemId ?? null, computedAt: now, expiresAt },
      });
  }
  const produced = drafts.map(key);
  const stale = produced.length ? notInArray(sql`${recommendation.kind} || ':' || ${recommendation.target}`, produced) : sql`true`;
  await db.delete(recommendation).where(and(eq(recommendation.workspaceId, workspaceId), eq(recommendation.status, "open"), stale));
  await db.delete(recommendation).where(and(eq(recommendation.workspaceId, workspaceId), lt(recommendation.expiresAt, now)));
  return drafts.length;
}

export type RecommendationRow = Pick<Recommendation, "id" | "kind" | "target" | "title" | "body" | "evidence" | "confidence" | "action" | "status" | "channelId" | "contentItemId" | "computedAt">;

const COLUMNS = { id: recommendation.id, kind: recommendation.kind, target: recommendation.target, title: recommendation.title, body: recommendation.body, evidence: recommendation.evidence, confidence: recommendation.confidence, action: recommendation.action, status: recommendation.status, channelId: recommendation.channelId, contentItemId: recommendation.contentItemId, computedAt: recommendation.computedAt };

const ORDER = sql`case ${recommendation.confidence} when 'high' then 0 when 'medium' then 1 else 2 end, ${recommendation.computedAt} desc`;

/**
 * Live recommendations for a workspace. Safe before the migration exists
 * (returns empty) — every surface then shows its honest "not enough data" copy.
 */
export async function listRecommendations(workspaceId: string, opts: { statuses?: ("open" | "dismissed" | "applied")[]; limit?: number } = {}): Promise<RecommendationRow[]> {
  const statuses = opts.statuses ?? ["open"];
  try {
    return await db
      .select(COLUMNS)
      .from(recommendation)
      .where(and(eq(recommendation.workspaceId, workspaceId), inArray(recommendation.status, statuses), gt(recommendation.expiresAt, new Date())))
      .orderBy(ORDER)
      .limit(opts.limit ?? 50);
  } catch (err) {
    log.warn("recommendations unavailable", { workspaceId, err });
    return [];
  }
}

/** Recommendations attached to one content item (the post detail "Reuse" hint). */
export async function recommendationsForItem(workspaceId: string, contentItemId: string): Promise<RecommendationRow[]> {
  try {
    return await db
      .select(COLUMNS)
      .from(recommendation)
      .where(and(eq(recommendation.workspaceId, workspaceId), eq(recommendation.contentItemId, contentItemId), eq(recommendation.status, "open"), gt(recommendation.expiresAt, new Date())))
      .orderBy(ORDER);
  } catch (err) {
    log.warn("item recommendations unavailable", { workspaceId, contentItemId, err });
    return [];
  }
}
