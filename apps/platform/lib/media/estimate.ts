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
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { mediaJob } from "@/db/schema/media";
import type { JobKind } from "@rocketease/media";
import { formatCredits } from "@/lib/ai/usage/credits";

/** Kinds whose billed unit is an image, and whose is a second of video. */
const IMAGE_KINDS: JobKind[] = ["product_still", "scene_still", "typographic_still"];
const VIDEO_KINDS: JobKind[] = ["product_motion", "hero_shot", "broll", "sequence"];

/** Enough to smooth a plain backdrop against a busy scene, few enough to stay recent. */
const SAMPLE = 20;

/** Median, not mean: one unusually busy image should not move the figure. */
function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Median credits per billed unit for one kind of job, or null with no history. */
async function medianCreditsPerUnit(workspaceId: string, kinds: JobKind[]): Promise<number | null> {
  const rows = await db
    .select({ credits: mediaJob.credits, quantity: mediaJob.quantity })
    .from(mediaJob)
    .where(and(
      eq(mediaJob.workspaceId, workspaceId),
      eq(mediaJob.state, "succeeded"),
      isNotNull(mediaJob.credits),
      inArray(mediaJob.jobKind, kinds),
    ))
    .orderBy(desc(mediaJob.createdAt))
    .limit(SAMPLE);

  const perUnit = rows
    .map((r) => ({ credits: Number(r.credits), units: Math.max(1, Number(r.quantity ?? 1)) }))
    .filter((r) => Number.isFinite(r.credits) && Number.isFinite(r.units) && r.credits > 0)
    .map((r) => r.credits / r.units);

  return median(perUnit);
}

/** "About 1.2 credits per image, from your recent generations." Null when unknown. */
export async function imageUnitEstimate(workspaceId: string): Promise<string | null> {
  const m = await medianCreditsPerUnit(workspaceId, IMAGE_KINDS);
  return m === null ? null : `About ${formatCredits(m)} credits per image, from your recent generations.`;
}

/*
 * Video is quoted per SECOND, not per clip, because the length is the thing the
 * person is choosing and a clip figure would be three different numbers.
 */
export async function videoUnitEstimate(workspaceId: string): Promise<string | null> {
  const m = await medianCreditsPerUnit(workspaceId, VIDEO_KINDS);
  return m === null ? null : `About ${formatCredits(m)} credits per second, from your recent clips.`;
}
