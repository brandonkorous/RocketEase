import { enqueue } from "@/lib/jobs/boss";
import { dueQueryIds } from "./check";

/** Enqueue a check for every query that is due; singleton keys skip one already waiting. */
export async function enqueueListeningChecks(): Promise<number> {
  const ids = await dueQueryIds();
  for (const queryId of ids) await enqueue("listening.check", { queryId }, { singletonKey: `listening.check:${queryId}`, singletonSeconds: 300 });
  return ids.length;
}
