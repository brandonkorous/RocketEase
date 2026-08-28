import { computeForWorkspace } from "@/lib/recommendations/compute";
import { workspacesToScore } from "@/lib/recommendations/facts";
import type { JobPayloads } from "@/lib/jobs/queues";
import type { HandlerContext } from "./index";

/**
 * Nightly (and on-demand) recommendation pass. Idempotent: every run rewrites
 * the same deduped rows, so a redelivery costs nothing.
 */
export async function recommendationsCompute(data: JobPayloads["recommendations.compute"], ctx: HandlerContext) {
  const targets = data.workspaceId ? [{ id: data.workspaceId }] : await workspacesToScore();
  for (const t of targets) {
    if (ctx.signal.aborted) return;
    const r = await computeForWorkspace(t.id);
    if (!r) continue;
    ctx.log.info("recommendations computed", { workspaceId: t.id, recommendations: r.recommendations, slots: r.slots, channels: r.channels, posts: r.posts });
  }
}
