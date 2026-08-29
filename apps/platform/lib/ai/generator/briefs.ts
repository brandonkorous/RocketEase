/*
 * Saved briefs. A brief is the marketer's own words, kept so next month's run
 * starts from it. Reading one back re-validates it: a brief saved before a
 * channel was disconnected must not silently target a channel that is gone.
 */
import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { generatorBrief } from "@/db/schema/generator";
import { briefSchema, type Brief } from "./types";

export type SavedBrief = { id: string; name: string; brief: Brief; createdAt: string };

const MAX_SAVED = 20;

export async function saveBriefRow(input: { organizationId: string; workspaceId: string; userId: string; name: string; brief: Brief }): Promise<{ id: string }> {
  const [row] = await db
    .insert(generatorBrief)
    .values({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      name: input.name,
      brief: input.brief as unknown as Record<string, unknown>,
    })
    .returning({ id: generatorBrief.id });
  return row;
}

/** Rows that no longer parse are dropped from the list rather than half-shown. */
export async function listBriefs(workspaceId: string): Promise<SavedBrief[]> {
  const rows = await db
    .select()
    .from(generatorBrief)
    .where(eq(generatorBrief.workspaceId, workspaceId))
    .orderBy(desc(generatorBrief.createdAt))
    .limit(MAX_SAVED);
  return rows.flatMap((r) => {
    const parsed = briefSchema.safeParse(r.brief);
    return parsed.success ? [{ id: r.id, name: r.name, brief: parsed.data as Brief, createdAt: r.createdAt.toISOString() }] : [];
  });
}
