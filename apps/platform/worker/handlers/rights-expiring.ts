import type { JobPayloads } from "@/lib/jobs/queues";
import { sweepExpiringClocks } from "@/lib/rights/expiry";
import type { HandlerContext } from "./index";

/** Nightly: notify before a rights or authorisation clock lapses under a scheduled or promoted post (M8.4). */
export async function rightsExpiring(_data: JobPayloads["rights.expiring"], ctx: HandlerContext) {
  const sent = await sweepExpiringClocks();
  ctx.log.info("rights expiry swept", { notified: sent });
}
