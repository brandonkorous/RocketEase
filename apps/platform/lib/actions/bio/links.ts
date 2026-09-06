"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bioLink, bioPage } from "@/db/schema/bio";
import { audit } from "@/lib/audit";
import { BIO_LIMITS, normalizeUrl } from "@/lib/bio/rules";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

const L = BIO_LIMITS;

async function ownPage(workspaceId: string) {
  const ctx = await requireCapability(workspaceId, "workspace.settings");
  const page = await db.query.bioPage.findFirst({ where: eq(bioPage.workspaceId, workspaceId) });
  if (!page) throw new Error("no_page");
  return { ctx, page };
}

const refresh = (workspaceId: string, slug: string) => {
  revalidatePath(`/app/${workspaceId}/brand`, "layout");
  revalidatePath(`/l/${slug}`);
};

const note = (ctx: { session: { user: { id: string } }; workspace: { organizationId: string } }, workspaceId: string, targetId: string, what: string, summary: Record<string, unknown>) =>
  audit({ action: "workspace.bio_page", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "bio_link", targetId, summary: { note: what, ...summary } });

/** A new empty row at the end, to be filled in; the public page skips a link with no title or address. */
export async function addLink(workspaceId: string): Promise<ActionState & { linkId?: string }> {
  return guard(async () => {
    const { ctx, page } = await ownPage(workspaceId);
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(bioLink).where(eq(bioLink.pageId, page.id));
    if (Number(n) >= L.links) return fail(`A page holds ${L.links} links at most. Remove one first.`);
    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${bioLink.position}), -1)` }).from(bioLink).where(eq(bioLink.pageId, page.id));
    const [row] = await db.insert(bioLink).values({ organizationId: page.organizationId, workspaceId, pageId: page.id, position: Number(max) + 1 }).returning({ id: bioLink.id });
    await note(ctx, workspaceId, row.id, "link:add", {});
    refresh(workspaceId, page.slug);
    return { ok: "Link added. Give it a title and an address.", linkId: row.id };
  });
}

const linkSchema = z.object({ workspaceId: z.string().min(1), linkId: z.string().min(1), title: z.string().trim().max(L.title).optional(), url: z.string().trim().max(L.url).optional(), enabled: z.boolean().optional() });

export async function updateLink(input: z.input<typeof linkSchema>): Promise<ActionState> {
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the link.");
  const { workspaceId, linkId, ...patch } = parsed.data;
  return guard(async () => {
    const { ctx, page } = await ownPage(workspaceId);
    const link = await db.query.bioLink.findFirst({ where: and(eq(bioLink.id, linkId), eq(bioLink.pageId, page.id)) });
    if (!link) return fail("Link not found.");
    const values: Partial<typeof link> = { updatedAt: new Date() };
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.enabled !== undefined) values.enabled = patch.enabled;
    if (patch.url !== undefined) {
      const r = normalizeUrl(patch.url);
      if ("error" in r) return fail(r.error);
      values.url = r.url;
    }
    await db.update(bioLink).set(values).where(eq(bioLink.id, link.id));
    await note(ctx, workspaceId, link.id, "link:update", { before: { title: link.title, url: link.url, enabled: link.enabled }, after: values });
    refresh(workspaceId, page.slug);
    if (patch.enabled !== undefined) return { ok: patch.enabled ? "Link shown." : "Link hidden. Its counts are kept." };
    return { ok: patch.url !== undefined ? "Address saved." : "Title saved." };
  });
}

export async function removeLink(workspaceId: string, linkId: string): Promise<ActionState> {
  return guard(async () => {
    const { ctx, page } = await ownPage(workspaceId);
    const [gone] = await db.delete(bioLink).where(and(eq(bioLink.id, linkId), eq(bioLink.pageId, page.id))).returning({ title: bioLink.title, url: bioLink.url });
    if (!gone) return fail("Link not found.");
    await note(ctx, workspaceId, linkId, "link:remove", { before: gone });
    refresh(workspaceId, page.slug);
    return { ok: "Link removed, with its click counts." };
  });
}

/** The full order, top to bottom. Ids that are not this page's links are ignored. */
export async function reorderLinks(workspaceId: string, orderedIds: string[]): Promise<ActionState> {
  if (orderedIds.length === 0 || orderedIds.length > L.links) return fail("Nothing to reorder.");
  return guard(async () => {
    const { ctx, page } = await ownPage(workspaceId);
    await db.transaction(async (tx) => {
      for (const [i, id] of orderedIds.entries()) await tx.update(bioLink).set({ position: i, updatedAt: new Date() }).where(and(eq(bioLink.id, id), eq(bioLink.pageId, page.id)));
    });
    await note(ctx, workspaceId, page.id, "link:reorder", { after: { order: orderedIds } });
    refresh(workspaceId, page.slug);
    return { ok: "Order saved." };
  });
}
