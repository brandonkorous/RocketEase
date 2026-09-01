/*
 * What the person just asked for, and what became of it.
 *
 * Generation is the one thing in the product that takes minutes and spends
 * money, and until this existed a job that failed was INVISIBLE: a green toast
 * said it would land in the library, and then nothing ever did (docs/bugs/B-007).
 * Every field below was already recorded — nothing read it back.
 *
 * Deliberately narrow: jobs still running, and failures recent enough that the
 * person who started them is still here. A job that succeeded is not listed,
 * because its asset IS the evidence and it is already in the grid.
 */
import { and, desc, eq, gt, inArray, or } from "drizzle-orm";
import { MEDIA_KIND_OF, type JobKind, type MediaKind } from "@rocketease/media";
import { db } from "@/db";
import { mediaJob } from "@/db/schema/media";

/** Long enough to cover a walk away from the desk, short enough to stay a feed. */
const FAILURE_WINDOW_HOURS = 24;

export type GenerationRow = {
  id: string;
  kind: MediaKind;
  state: "queued" | "running" | "failed";
  prompt: string | null;
  /** The user-facing reason. Never the raw vendor payload. */
  error: string | null;
  /**
   * What the customer was billed, if anything. Read rather than assumed: a job
   * can fail AFTER the vendor has charged for it (a download that expires), and
   * "nothing was charged" is not ours to promise on a failure's behalf.
   */
  credits: number | null;
  createdAt: string;
};

export async function recentGenerations(workspaceId: string): Promise<GenerationRow[]> {
  const since = new Date(Date.now() - FAILURE_WINDOW_HOURS * 3600_000);
  const rows = await db
    .select({
      id: mediaJob.id, jobKind: mediaJob.jobKind, state: mediaJob.state, spec: mediaJob.spec,
      note: mediaJob.errorNote, category: mediaJob.errorCategory, credits: mediaJob.credits, createdAt: mediaJob.createdAt,
    })
    .from(mediaJob)
    .where(
      and(
        eq(mediaJob.workspaceId, workspaceId),
        or(inArray(mediaJob.state, ["queued", "running"]), and(eq(mediaJob.state, "failed"), gt(mediaJob.createdAt, since))),
      ),
    )
    .orderBy(desc(mediaJob.createdAt))
    .limit(6);

  return rows.map((r) => ({
    id: r.id,
    // The registry's own map, not a second copy of it — inventing job kinds
    // here is how the Sora contract went wrong (docs/bugs/B-006).
    kind: MEDIA_KIND_OF[r.jobKind as JobKind] ?? "image",
    state: r.state as GenerationRow["state"],
    prompt: typeof r.spec?.prompt === "string" ? r.spec.prompt : null,
    // A failure with no recorded note still has to say something true, so the
    // category is the fallback rather than an empty line.
    error: r.state === "failed" ? r.note ?? r.category ?? "It failed, and no reason was recorded." : null,
    // numeric() reads back as a string; null stays null rather than becoming 0.
    credits: r.credits === null ? null : Number(r.credits),
    createdAt: r.createdAt.toISOString(),
  }));
}
