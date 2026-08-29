"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { hashtagSet } from "@/db/schema/hashtags";
import { audit } from "@/lib/audit";
import { normalizeTags } from "@/lib/hashtags";
import { requireCapability, requireWorkspace } from "@/lib/session";
import { fail, guard, type ActionState } from "./content/shared";

export type HashtagSetRow = { id: string; name: string; tags: string[]; channelKinds: string[]; usageCount: number };

const MAX_TAGS = 60;

/** Sets for the composer popover and the settings list (any member may read). */
export async function listHashtagSets(workspaceId: string): Promise<HashtagSetRow[]> {
  await requireWorkspace(workspaceId);
  const rows = await db.select().from(hashtagSet).where(eq(hashtagSet.workspaceId, workspaceId)).orderBy(desc(hashtagSet.usageCount), hashtagSet.name).limit(100);
  return rows.map((r) => ({ id: r.id, name: r.name, tags: r.tags, channelKinds: r.channelKinds, usageCount: r.usageCount }));
}

const saveSchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Name the set").max(60),
  /** Free text; "#one, two #three" all parse the same way. */
  tags: z.string().max(2000),
  channelKinds: z.array(z.string().max(40)).max(12).default([]),
});
export type HashtagSetInput = z.input<typeof saveSchema>;

export async function saveHashtagSet(input: HashtagSetInput): Promise<ActionState & { id?: string }> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid hashtag set");
  const { workspaceId, id, name, channelKinds } = parsed.data;
  const tags = normalizeTags(parsed.data.tags);
  if (tags.length === 0) return fail("Add at least one hashtag.");
  if (tags.length > MAX_TAGS) return fail(`A set holds at most ${MAX_TAGS} hashtags.`);
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.edit");
    const org = ctx.workspace.organizationId;
    const clash = await db.query.hashtagSet.findFirst({ where: (h, { and, eq }) => and(eq(h.workspaceId, workspaceId), eq(h.name, name)) });
    if (clash && clash.id !== id) return fail(`A set called "${name}" already exists.`);
    if (id) {
      const [row] = await db.update(hashtagSet).set({ name, tags, channelKinds, updatedAt: new Date() }).where(and(eq(hashtagSet.id, id), eq(hashtagSet.workspaceId, workspaceId))).returning({ id: hashtagSet.id });
      if (!row) return fail("Hashtag set not found.");
      await audit({ action: "content.hashtag_set_update", actorUserId: ctx.session.user.id, organizationId: org, workspaceId, targetType: "hashtag_set", targetId: row.id, summary: { after: { name, tags } } });
      return { ok: "Hashtag set saved.", id: row.id };
    }
    const [row] = await db.insert(hashtagSet).values({ organizationId: org, workspaceId, name, tags, channelKinds, createdByUserId: ctx.session.user.id }).returning({ id: hashtagSet.id });
    await audit({ action: "content.hashtag_set_create", actorUserId: ctx.session.user.id, organizationId: org, workspaceId, targetType: "hashtag_set", targetId: row.id, summary: { after: { name, tags } } });
    return { ok: "Hashtag set created.", id: row.id };
  });
}

export async function deleteHashtagSet(workspaceId: string, id: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "content.edit");
    const [row] = await db.delete(hashtagSet).where(and(eq(hashtagSet.id, id), eq(hashtagSet.workspaceId, workspaceId))).returning({ id: hashtagSet.id, name: hashtagSet.name });
    if (!row) return fail("Hashtag set not found.");
    await audit({ action: "content.hashtag_set_delete", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "hashtag_set", targetId: row.id, summary: { before: { name: row.name } } });
    return { ok: "Hashtag set deleted." };
  });
}

/** Fire-and-forget usage counter so the popover can order by what the team actually uses. */
export async function noteHashtagSetUsed(workspaceId: string, id: string): Promise<void> {
  try {
    await requireWorkspace(workspaceId);
    await db.update(hashtagSet).set({ usageCount: sql`${hashtagSet.usageCount} + 1` }).where(and(eq(hashtagSet.id, id), eq(hashtagSet.workspaceId, workspaceId)));
  } catch {
    // A counter is never worth failing an edit over.
  }
}
