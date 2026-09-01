/*
 * What one generated image will cost the author, said BEFORE the button is
 * pressed — in CREDITS, the unit the product bills in.
 *
 * Not vendor dollars: those are our cost of goods, and the configured rate is
 * the ceiling's SAFETY rate, deliberately rounded up past the busiest image
 * measured. Quoted as an estimate it overstated a typical image roughly
 * eightfold (docs/bugs/B-004).
 *
 * Credits cannot be predicted from the request — an image's tokens track how
 * busy the picture is — so this reports what this workspace has actually been
 * charged, and says nothing at all until there is something to report.
 */
import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { mediaJob } from "@/db/schema/media";
import { formatCredits } from "@/lib/ai/usage/credits";

/** Enough to smooth a plain backdrop against a busy scene, few enough to stay recent. */
const SAMPLE = 20;

/** Median, not mean: one unusually busy image should not move the figure. */
function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** "About 1.2 credits per image, from your recent generations." Null when unknown. */
export async function imageUnitEstimate(workspaceId: string): Promise<string | null> {
  const rows = await db
    .select({ credits: mediaJob.credits, quantity: mediaJob.quantity })
    .from(mediaJob)
    .where(and(eq(mediaJob.workspaceId, workspaceId), eq(mediaJob.state, "succeeded"), isNotNull(mediaJob.credits)))
    .orderBy(desc(mediaJob.createdAt))
    .limit(SAMPLE);

  const perImage = rows
    .map((r) => ({ credits: Number(r.credits), images: Math.max(1, Number(r.quantity ?? 1)) }))
    .filter((r) => Number.isFinite(r.credits) && Number.isFinite(r.images) && r.credits > 0)
    .map((r) => r.credits / r.images);

  const m = median(perImage);
  return m === null ? null : `About ${formatCredits(m)} credits per image, from your recent generations.`;
}
