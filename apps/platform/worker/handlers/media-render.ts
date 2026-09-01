/*
 * The render queue: ad composites and caption burn-in, on the media worker.
 *
 * Unlike media.generate this spends CPU rather than money, and both branches are
 * deterministic, so retrying is safe and needs no vendor reconciliation. What it
 * must NOT do is fail silently: a render that produces a blocking preflight
 * issue still writes the file, and logs the reason a person will see beside it.
 */
import { assemblePlanVariant } from "@/lib/media/assembly-job";
import { burnCaptionTrack } from "@/lib/media/caption-job";
import { renderPlanVariant } from "@/lib/media/render-job";
import type { JobPayloads } from "@/lib/jobs/queues";
import type { HandlerContext } from "./index";

export async function mediaRender(data: JobPayloads["media.render"], ctx: HandlerContext) {
  if (data.kind === "caption_burn") return burnJob(data, ctx);
  if (data.kind === "assembly") return assemblyJob(data, ctx);
  return adJob(data, ctx);
}

type Ad = Extract<JobPayloads["media.render"], { kind: "ad_plan" }>;
type Burn = Extract<JobPayloads["media.render"], { kind: "caption_burn" }>;
type Assembly = Extract<JobPayloads["media.render"], { kind: "assembly" }>;

async function assemblyJob(data: Assembly, ctx: HandlerContext) {
  const l = ctx.log.child({ contentItemId: data.contentItemId, placement: data.placement, variantId: data.variantId });
  const result = await assemblePlanVariant(data);
  if ("error" in result) {
    l.warn("assembly skipped", { reason: result.error });
    return;
  }
  l.info("video assembled", { assetId: result.assetId, notes: result.notes });
}

async function adJob(data: Ad, ctx: HandlerContext) {
  const l = ctx.log.child({ contentItemId: data.contentItemId, placement: data.placement, variantId: data.variantId });
  const result = await renderPlanVariant(data);
  if ("error" in result) {
    // A plan edited out from under an in-flight render is expected, not a fault.
    l.warn("ad render skipped", { reason: result.error });
    return;
  }
  l.info("ad rendered", {
    assetId: result.assetId,
    issues: result.issues.length,
    blocking: result.issues.filter((i) => i.severity === "error").length,
    codes: [...new Set(result.issues.map((i) => i.code))],
  });
}

async function burnJob(data: Burn, ctx: HandlerContext) {
  const l = ctx.log.child({ assetId: data.assetId, captionTrackId: data.captionTrackId, placement: data.placement });
  const result = await burnCaptionTrack(data);
  if ("error" in result) {
    l.warn("caption burn skipped", { reason: result.error });
    return;
  }
  l.info("captions burned in", { assetId: result.assetId, notes: result.notes });
}
