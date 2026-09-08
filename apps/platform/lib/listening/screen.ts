import "server-only";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { listeningCheck, listeningHit, listeningQuery } from "@/db/schema/listening";
import { agoLabel } from "@/lib/accounts/format";
import { formatInZone } from "@/lib/time";
import { AD_SOURCES, EU_COUNTRIES, LISTENING_COVERAGE, LISTENING_NETWORKS, PAGE_SIZE, type AdSource, type Coverage, type ListeningNetwork } from "./coverage";
import { searchAs } from "./credentials";
import { tiktokAdsConfigured } from "./ads/tiktok";

export type QueryRow = { id: string; name: string; terms: string[]; networks: ListeningNetwork[]; enabled: boolean; hits7d: number; lastChecked: string | null; checks: { network: ListeningNetwork; status: string; note: string | null; at: string }[] };
export type HitRow = { id: string; network: ListeningNetwork; networkLabel: string; author: { name: string; handle?: string; url?: string }; text: string; url: string | null; at: string; term: string };
export type CoverageRow = Coverage & { key: string; state: string | null };
export type ListeningScreenData = {
  workspaceId: string; canEdit: boolean; view: "listening" | "ads";
  queries: QueryRow[]; activeQueryId: string | null; network: ListeningNetwork | null;
  feed: { rows: HitRow[]; page: number; pageSize: number; total: number; counts: Record<ListeningNetwork, number> };
  coverage: CoverageRow[]; adSources: (Coverage & { key: AdSource; state: string | null })[]; countries: { code: string; name: string }[];
  /** Per-network words for the query dialog: how each network is reached in this workspace. */
  networkState: Record<ListeningNetwork, string>;
};

const label = (n: ListeningNetwork) => LISTENING_COVERAGE[n].label;

async function queryRows(workspaceId: string, tz: string): Promise<QueryRow[]> {
  const qs = await db.select().from(listeningQuery).where(eq(listeningQuery.workspaceId, workspaceId)).orderBy(listeningQuery.createdAt);
  if (!qs.length) return [];
  const ids = qs.map((q) => q.id);
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [hits, checks] = await Promise.all([
    db.select({ queryId: listeningHit.queryId, n: count() }).from(listeningHit).where(and(inArray(listeningHit.queryId, ids), eq(listeningHit.hidden, false), gte(listeningHit.occurredAt, since))).groupBy(listeningHit.queryId),
    db.select().from(listeningCheck).where(inArray(listeningCheck.queryId, ids)).orderBy(desc(listeningCheck.checkedAt)).limit(ids.length * 6),
  ]);
  const hitCount = new Map(hits.map((h) => [h.queryId, Number(h.n)]));
  return qs.map((q) => {
    const latest = new Map<string, (typeof checks)[number]>();
    for (const c of checks) if (c.queryId === q.id && !latest.has(c.network)) latest.set(c.network, c);
    return {
      id: q.id, name: q.name, terms: q.terms, networks: q.networks, enabled: q.enabled, hits7d: hitCount.get(q.id) ?? 0,
      lastChecked: q.lastCheckedAt ? agoLabel(q.lastCheckedAt, tz) : null,
      checks: q.networks.map((n) => { const c = latest.get(n); return c ? { network: n, status: c.status, note: c.note, at: agoLabel(c.checkedAt, tz) } : { network: n, status: "pending", note: "Not checked yet.", at: "—" }; }),
    };
  });
}

async function feedFor(queryId: string | null, network: ListeningNetwork | null, page: number, tz: string): Promise<ListeningScreenData["feed"]> {
  const counts = { bluesky: 0, threads: 0, youtube: 0 } as Record<ListeningNetwork, number>;
  if (!queryId) return { rows: [], page: 1, pageSize: PAGE_SIZE, total: 0, counts };
  const base = and(eq(listeningHit.queryId, queryId), eq(listeningHit.hidden, false));
  const byNetwork = await db.select({ network: listeningHit.network, n: count() }).from(listeningHit).where(base).groupBy(listeningHit.network);
  for (const r of byNetwork) counts[r.network] = Number(r.n);
  const where = network ? and(base, eq(listeningHit.network, network)) : base;
  const total = network ? counts[network] : Object.values(counts).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  const rows = await db.select().from(listeningHit).where(where).orderBy(desc(listeningHit.occurredAt)).limit(PAGE_SIZE).offset((p - 1) * PAGE_SIZE);
  return { rows: rows.map((h) => ({ id: h.id, network: h.network, networkLabel: label(h.network), author: h.author, text: h.text, url: h.url, at: agoLabel(h.occurredAt, tz), term: h.term })), page: p, pageSize: PAGE_SIZE, total, counts };
}

/** How each searchable network is reached from this workspace, in a sentence. */
async function networkState(workspaceId: string): Promise<Record<ListeningNetwork, string>> {
  const [bluesky, threads, youtube] = await Promise.all([searchAs(workspaceId, "bluesky"), searchAs(workspaceId, "threads"), searchAs(workspaceId, "youtube")]);
  const words = (r: Awaited<ReturnType<typeof searchAs>>) => (r.ok ? `Searched as ${r.as}.` : r.why);
  return { bluesky: words(bluesky), threads: words(threads), youtube: words(youtube) };
}

export async function listeningScreen(input: { workspaceId: string; timezone: string; canEdit: boolean; sp: { query?: string; network?: string; page?: string; view?: string } }): Promise<ListeningScreenData> {
  const { workspaceId, timezone: tz, sp } = input;
  const view = sp.view === "ads" ? "ads" : "listening";
  const [queries, state, meta] = await Promise.all([queryRows(workspaceId, tz), networkState(workspaceId), searchAs(workspaceId, "facebook")]);
  const activeQueryId = queries.find((q) => q.id === sp.query)?.id ?? queries[0]?.id ?? null;
  const network = (LISTENING_NETWORKS as readonly string[]).includes(sp.network ?? "") ? (sp.network as ListeningNetwork) : null;
  const feed = await feedFor(activeQueryId, network, Number(sp.page ?? 1) || 1, tz);
  const coverage: CoverageRow[] = Object.entries(LISTENING_COVERAGE).map(([key, c]) => ({ key, ...c, state: (LISTENING_NETWORKS as readonly string[]).includes(key) ? state[key as ListeningNetwork] : null }));
  const adSources = (Object.keys(AD_SOURCES) as AdSource[]).map((key) => ({ key, ...AD_SOURCES[key], state: key === "meta" ? (meta.ok ? `Read as ${meta.as}.` : meta.why) : tiktokAdsConfigured() ? "Enabled." : "Not enabled here: RocketEase's application is not approved yet." }));
  void formatInZone;
  return { workspaceId, canEdit: input.canEdit, view, queries, activeQueryId, network, feed, coverage, adSources, countries: EU_COUNTRIES, networkState: state };
}

/** The oldest hit time, for the "since" line; null with no hits. */
export const earliestHit = async (queryId: string) => (await db.select({ at: sql<string>`min(${listeningHit.occurredAt})` }).from(listeningHit).where(eq(listeningHit.queryId, queryId)))[0]?.at ?? null;
