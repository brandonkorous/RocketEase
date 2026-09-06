"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { AVATAR_SOURCES, BUTTON_STYLES, bioPage } from "@/db/schema/bio";
import { audit } from "@/lib/audit";
import { BIO_LIMITS, nextFreeSlug } from "@/lib/bio/rules";
import { loadBrandKit } from "@/lib/brand/load";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

const L = BIO_LIMITS;

/** Every write here is `workspace.settings`, the same bar as the brand kit the page is built from. */
async function ownPage(workspaceId: string) {
  const ctx = await requireCapability(workspaceId, "workspace.settings");
  const page = await db.query.bioPage.findFirst({ where: eq(bioPage.workspaceId, workspaceId) });
  return { ctx, page };
}

function refresh(workspaceId: string, slug: string) {
  revalidatePath(`/app/${workspaceId}/brand`, "layout");
  revalidatePath(`/l/${slug}`);
}

/** One page per workspace. The address is the workspace's slug, or the first free variant of it; it does not change afterwards. */
export async function createBioPage(workspaceId: string): Promise<ActionState> {
  return guard(async () => {
    const { ctx, page } = await ownPage(workspaceId);
    if (page) return fail("This workspace already has a page.");
    const kit = await loadBrandKit(workspaceId);
    const taken = new Set((await db.select({ slug: bioPage.slug }).from(bioPage)).map((r) => r.slug));
    const slug = nextFreeSlug(ctx.workspace.slug || ctx.workspace.name, (s) => taken.has(s));
    const name = (kit.identity.displayName || ctx.workspace.name).slice(0, L.name);
    const bio = (kit.channels.find((c) => c.bio)?.bio ?? kit.identity.oneLiner).slice(0, L.bio);
    const [created] = await db.insert(bioPage).values({ organizationId: ctx.workspace.organizationId, workspaceId, slug, name, bio }).returning({ id: bioPage.id });
    await audit({ action: "workspace.bio_page", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "bio_page", targetId: created.id, summary: { note: "create", after: { slug } } });
    refresh(workspaceId, slug);
    return { ok: `Your page is ready at /l/${slug}. It stays private until you switch it to Live.` };
  });
}

const patchSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1).max(L.name).optional(),
  bio: z.string().trim().max(L.bio).optional(),
  live: z.boolean().optional(),
  avatar: z.enum(AVATAR_SOURCES).optional(),
  buttonStyle: z.enum(BUTTON_STYLES).optional(),
  showPosts: z.boolean().optional(),
  postsChannelId: z.string().nullable().optional(),
});

const SAID: Record<string, string> = { name: "Name saved.", bio: "Bio saved.", avatar: "Avatar saved.", buttonStyle: "Button colour saved.", showPosts: "Latest posts saved.", postsChannelId: "Channel saved." };

/** One field at a time, saved as you go. */
export async function updateBioPage(input: z.input<typeof patchSchema>): Promise<ActionState> {
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the field.");
  const { workspaceId, ...patch } = parsed.data;
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length === 0) return fail("Nothing to save.");
  return guard(async () => {
    const { ctx, page } = await ownPage(workspaceId);
    if (!page) return fail("Create the page first.");
    if (patch.postsChannelId) {
      const ch = await db.query.channel.findFirst({ where: (c, { and, eq }) => and(eq(c.id, patch.postsChannelId!), eq(c.workspaceId, workspaceId)) });
      if (!ch) return fail("That channel is not in this workspace.");
    }
    await db.update(bioPage).set({ ...patch, updatedAt: new Date() }).where(eq(bioPage.id, page.id));
    const before = Object.fromEntries(keys.map((k) => [k, page[k]]));
    await audit({ action: "workspace.bio_page", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "bio_page", targetId: page.id, summary: { note: keys.join(","), before, after: patch } });
    refresh(workspaceId, page.slug);
    if (patch.live !== undefined) return { ok: patch.live ? "Your page is live. Anyone with the link can open it." : "Your page is hidden. The address stays yours." };
    return { ok: SAID[keys[0]] ?? "Saved." };
  });
}
