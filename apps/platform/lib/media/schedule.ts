/*
 * The heartbeat that advances running generations.
 *
 * `media.generate` emits exactly ONE `media.poll` per job. A clip that is still
 * rendering when that single poll fires — which is every clip, because Sora
 * takes about a minute and the poll lands seconds after submission — was
 * stranded forever: the vendor finished, the delivery URL expired, and the
 * money was spent on a file nobody ever collected (docs/bugs/B-008).
 *
 * A sweep rather than a per-job re-emit, deliberately: a re-emit cannot rescue
 * a job already stranded by a crash, and this one can.
 */
import { count, inArray } from "drizzle-orm";
import { db } from "@/db";
import { mediaJob } from "@/db/schema/media";
import { enqueue } from "@/lib/jobs/boss";

/** Nothing unfinished means nothing to enqueue — the quiet case is the common one. */
export async function enqueueMediaPolls(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(mediaJob).where(inArray(mediaJob.state, ["queued", "running"]));
  const n = Number(row?.n ?? 0);
  if (n === 0) return 0;
  // One sweep for all of them; the handler reads every unfinished job itself.
  await enqueue("media.poll", {}, { singletonKey: "media.poll:sweep", singletonSeconds: 10 });
  return n;
}
