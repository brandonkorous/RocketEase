import type { JobPayloads } from "@/lib/jobs/queues";
import { runQualityChecks, workspacesWithChannels } from "@/lib/analytics/quality-store";
import type { HandlerContext } from "./index";

/** Daily data-quality sweep (5.7). One workspace when given, otherwise every workspace with channels. */
export async function qualityCheck(data: JobPayloads["quality.check"], ctx: HandlerContext) {
  const targets = data.workspaceId ? [{ id: data.workspaceId, organizationId: data.organizationId ?? "" }] : await workspacesWithChannels();
  for (const ws of targets) {
    if (ctx.signal.aborted) return;
    try {
      const n = await runQualityChecks(ws.organizationId, ws.id);
      ctx.log.info("quality checked", { workspaceId: ws.id, findings: n });
    } catch (err) {
      ctx.log.error("quality check failed", { workspaceId: ws.id, err });
    }
  }
}
