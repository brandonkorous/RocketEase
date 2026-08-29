import { runProviderDeletion } from "@/lib/provider-deletion";
import type { JobPayloads } from "@/lib/jobs/queues";
import type { HandlerContext } from "./index";

/**
 * Erase every connection a provider identity owns after a verified deauthorize
 * or data-deletion callback. Idempotent, so a provider retry is always safe.
 */
export async function providerDeletion(data: JobPayloads["provider.deletion"], ctx: HandlerContext) {
  ctx.log.info("provider deletion starting", { requestId: data.requestId });
  await runProviderDeletion(data.requestId);
  ctx.log.info("provider deletion done", { requestId: data.requestId });
}
