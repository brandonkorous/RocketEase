/*
 * One check of one query (M14.11): every term on every network the query
 * lists, new hits written once (unique per query, network and post), and one
 * `listening_check` row per network saying what happened. A network that
 * refuses is recorded in its words and never stops the others. Worker-safe.
 */
import { and, desc, eq } from "drizzle-orm";
import { ProviderError } from "@rocketease/providers";
import { db } from "@/db";
import { listeningCheck, listeningHit, listeningQuery, type ListeningQuery } from "@/db/schema/listening";
import { CHECK_EVERY_MS, FIRST_CHECK_DAYS, type ListeningNetwork } from "./coverage";
import { searchAs } from "./credentials";
import { searchBluesky } from "./sources/bluesky";
import { searchThreads } from "./sources/threads";
import { searchYouTube } from "./sources/youtube";
import type { ListeningItem, SearchInput } from "./types";

const PER_TERM = 25;
/** Re-read a little further back than the last check, so a slow network's late posts are not missed. */
const OVERLAP_MS = 10 * 60_000;

async function sinceFor(q: ListeningQuery, network: ListeningNetwork): Promise<Date> {
  const [last] = await db.select({ at: listeningCheck.checkedAt }).from(listeningCheck).where(and(eq(listeningCheck.queryId, q.id), eq(listeningCheck.network, network), eq(listeningCheck.status, "ok"))).orderBy(desc(listeningCheck.checkedAt)).limit(1);
  return last ? new Date(last.at.getTime() - OVERLAP_MS) : new Date(Date.now() - FIRST_CHECK_DAYS * 86_400_000);
}

async function searchNetwork(q: ListeningQuery, network: ListeningNetwork, input: SearchInput): Promise<ListeningItem[]> {
  const as = await searchAs(q.workspaceId, network);
  if (!as.ok) throw new ProviderError(as.why, { category: "permission", providerCode: "not_connected" });
  if (network === "bluesky") return (await searchBluesky(as.token, input)).items;
  return network === "threads" ? (await searchThreads(as.token, input)).items : (await searchYouTube(as.token, input)).items;
}

async function writeHits(q: ListeningQuery, network: ListeningNetwork, byTerm: Map<string, ListeningItem[]>): Promise<number> {
  let added = 0;
  const seen = new Set<string>();
  for (const [term, items] of byTerm) {
    for (const it of items) {
      if (seen.has(it.remoteId)) continue;
      seen.add(it.remoteId);
      const [row] = await db.insert(listeningHit).values({ organizationId: q.organizationId, workspaceId: q.workspaceId, queryId: q.id, network, remoteId: it.remoteId, term, author: it.author, text: it.text.slice(0, 2000), url: it.url, occurredAt: new Date(it.occurredAt) }).onConflictDoNothing().returning({ id: listeningHit.id });
      if (row) added++;
    }
  }
  return added;
}

/** Runs one network for the query and records the outcome; never throws. */
async function checkNetwork(q: ListeningQuery, network: ListeningNetwork): Promise<{ status: "ok" | "failed"; hits: number; note: string | null }> {
  try {
    const since = await sinceFor(q, network);
    const byTerm = new Map<string, ListeningItem[]>();
    for (const term of q.terms) byTerm.set(term, await searchNetwork(q, network, { term, since, limit: PER_TERM }));
    const hits = await writeHits(q, network, byTerm);
    await db.insert(listeningCheck).values({ workspaceId: q.workspaceId, queryId: q.id, network, status: "ok", hits, note: null });
    return { status: "ok", hits, note: null };
  } catch (e) {
    const note = e instanceof Error ? e.message : "The search failed.";
    await db.insert(listeningCheck).values({ workspaceId: q.workspaceId, queryId: q.id, network, status: "failed", hits: 0, note: note.slice(0, 500) });
    return { status: "failed", hits: 0, note };
  }
}

export async function runListeningCheck(queryId: string): Promise<{ results: Record<string, { status: string; hits: number; note: string | null }> } | null> {
  const q = await db.query.listeningQuery.findFirst({ where: (x, { eq }) => eq(x.id, queryId) });
  if (!q || !q.enabled) return null;
  const results: Record<string, { status: string; hits: number; note: string | null }> = {};
  for (const network of q.networks) results[network] = await checkNetwork(q, network);
  await db.update(listeningQuery).set({ lastCheckedAt: new Date(), updatedAt: new Date() }).where(eq(listeningQuery.id, q.id));
  return { results };
}

/** Queries whose last check is older than the interval, oldest first. */
export async function dueQueryIds(now = new Date()): Promise<string[]> {
  const rows = await db.select({ id: listeningQuery.id, at: listeningQuery.lastCheckedAt }).from(listeningQuery).where(eq(listeningQuery.enabled, true));
  return rows.filter((r) => !r.at || now.getTime() - r.at.getTime() >= CHECK_EVERY_MS).sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0)).map((r) => r.id);
}
