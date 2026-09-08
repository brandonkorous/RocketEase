"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { listeningHit, listeningQuery } from "@/db/schema/listening";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/jobs/outbox";
import { searchMetaAds } from "@/lib/listening/ads/meta";
import { searchTikTokAds, tiktokAdsConfigured } from "@/lib/listening/ads/tiktok";
import { AD_SOURCES, EU_COUNTRIES, LISTENING_NETWORKS } from "@/lib/listening/coverage";
import { searchAs } from "@/lib/listening/credentials";
import { parseTerms } from "@/lib/listening/terms";
import type { AdItem } from "@/lib/listening/types";
import { workspacePath } from "@/lib/nav";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "./content/shared";

const querySchema = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(80), terms: z.string().max(2000), networks: z.array(z.enum(LISTENING_NETWORKS)).min(1) });
export type ListeningQueryInput = z.input<typeof querySchema>;

const listening = (ws: string) => workspacePath(ws, "analytics/listening");

export async function saveListeningQuery(workspaceId: string, input: ListeningQueryInput): Promise<ActionState & { id?: string }> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const parsed = querySchema.safeParse(input);
    if (!parsed.success) return fail("Give the query a name, at least one term, and at least one network.");
    const terms = parseTerms(parsed.data.terms);
    if (!terms.length) return fail("Add at least one word or “quoted phrase”.");
    const values = { name: parsed.data.name, terms, networks: [...new Set(parsed.data.networks)], updatedAt: new Date() };
    const id = await db.transaction(async (tx) => {
      let qid = parsed.data.id ?? null;
      if (qid) {
        const [row] = await tx.update(listeningQuery).set(values).where(and(eq(listeningQuery.id, qid), eq(listeningQuery.workspaceId, workspaceId))).returning({ id: listeningQuery.id });
        if (!row) return null;
      } else {
        const [row] = await tx.insert(listeningQuery).values({ organizationId: ctx.workspace.organizationId, workspaceId, ...values, createdByUserId: ctx.session.user.id }).returning({ id: listeningQuery.id });
        qid = row.id;
      }
      // The first check runs now rather than at the next 30-minute tick.
      await tx.update(listeningQuery).set({ lastCheckedAt: null }).where(eq(listeningQuery.id, qid));
      await emit(tx, "listening.check", { queryId: qid }, { organizationId: ctx.workspace.organizationId, workspaceId, dedupeKey: `listening.check:${qid}:${Date.now()}` });
      return qid;
    });
    if (!id) return fail("That query no longer exists.");
    await audit({ action: parsed.data.id ? "listening.query.update" : "listening.query.create", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "listening_query", targetId: id, summary: { after: values } });
    revalidatePath(listening(workspaceId));
    return { ok: parsed.data.id ? "Query saved. Checking now." : "Query created. Checking now.", id };
  });
}

export async function setListeningQueryEnabled(workspaceId: string, id: string, enabled: boolean): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const [row] = await db.update(listeningQuery).set({ enabled, updatedAt: new Date() }).where(and(eq(listeningQuery.id, id), eq(listeningQuery.workspaceId, workspaceId))).returning({ id: listeningQuery.id });
    if (!row) return fail("That query no longer exists.");
    await audit({ action: "listening.query.update", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "listening_query", targetId: id, summary: { after: { enabled } } });
    revalidatePath(listening(workspaceId));
    return { ok: enabled ? "Query resumed." : "Query paused." };
  });
}

export async function deleteListeningQuery(workspaceId: string, id: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const [row] = await db.delete(listeningQuery).where(and(eq(listeningQuery.id, id), eq(listeningQuery.workspaceId, workspaceId))).returning({ name: listeningQuery.name });
    if (!row) return fail("That query no longer exists.");
    await audit({ action: "listening.query.delete", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "listening_query", targetId: id, summary: { before: { name: row.name } } });
    revalidatePath(listening(workspaceId));
    return { ok: "Query deleted, with its hits." };
  });
}

export async function checkListeningNow(workspaceId: string, id: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.create");
    const q = await db.query.listeningQuery.findFirst({ where: (x, { and, eq }) => and(eq(x.id, id), eq(x.workspaceId, workspaceId)) });
    if (!q) return fail("That query no longer exists.");
    await emit(db, "listening.check", { queryId: id }, { organizationId: ctx.workspace.organizationId, workspaceId, dedupeKey: `listening.check:${id}:${Date.now()}` });
    return { ok: "Checking now — hits appear within a minute." };
  });
}

/** Hidden by a person; the row stays so the same post is not captured again. */
export async function hideListeningHit(workspaceId: string, hitId: string): Promise<ActionState> {
  return guard(async () => {
    await requireCapability(workspaceId, "content.create");
    const [row] = await db.update(listeningHit).set({ hidden: true }).where(and(eq(listeningHit.id, hitId), eq(listeningHit.workspaceId, workspaceId))).returning({ id: listeningHit.id });
    if (!row) return fail("That post is no longer in the feed.");
    revalidatePath(listening(workspaceId));
    return { ok: "Hidden from the feed." };
  });
}

const adSchema = z.object({ term: z.string().trim().min(1).max(100), source: z.enum(["meta", "tiktok"]), country: z.string().length(2).toUpperCase(), days: z.union([z.literal(30), z.literal(90), z.literal(365)]), cursor: z.string().optional() });
export type AdSearchInput = z.input<typeof adSchema>;

/** A live read of a public ad repository; nothing is stored. Errors are the source's own words. */
export async function searchAds(workspaceId: string, input: AdSearchInput): Promise<ActionState & { items?: AdItem[]; cursor?: string | null; as?: string }> {
  return guard(async () => {
    await requireCapability(workspaceId, "analytics.view");
    const parsed = adSchema.safeParse(input);
    if (!parsed.success || !EU_COUNTRIES.some((c) => c.code === parsed.data?.country)) return fail("Enter a term, and pick a source and an EU country.");
    const { term, source, country, days, cursor } = parsed.data;
    try {
      if (source === "tiktok") {
        if (!tiktokAdsConfigured()) return fail(`${AD_SOURCES.tiktok.label}: ${AD_SOURCES.tiktok.how}`);
        const page = await searchTikTokAds({ term, country, days, cursor });
        return { ok: "", items: page.items, cursor: page.cursor ?? null, as: "RocketEase's TikTok application" };
      }
      const as = await searchAs(workspaceId, "facebook");
      if (!as.ok) return fail(as.why);
      const page = await searchMetaAds(as.token, process.env.META_APP_SECRET, { term, country, days, cursor });
      return { ok: "", items: page.items, cursor: page.cursor ?? null, as: as.as };
    } catch (e) {
      return fail(e instanceof Error ? e.message : "The repository could not be read.");
    }
  });
}
