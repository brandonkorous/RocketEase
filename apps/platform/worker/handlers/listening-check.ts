import { runListeningCheck } from "@/lib/listening/check";
import type { JobPayloads } from "@/lib/jobs/queues";
import type { HandlerContext } from "./index";

/** listening.check (M14.11): search every network the query lists and record what each answered. */
export async function listeningCheck(data: JobPayloads["listening.check"], ctx: HandlerContext) {
  const out = await runListeningCheck(data.queryId);
  if (out) ctx.log.info("listening checked", { queryId: data.queryId, results: out.results });
}
