import type { JobPayloads } from "@/lib/jobs/queues";
import { evaluateTrigger } from "@/lib/automations/run";
import type { HandlerContext } from "./index";

/**
 * Evaluate every enabled rule for one trigger event. Idempotent: a redelivered
 * job hits the unique (rule, triggerRef) key and is counted as a duplicate
 * rather than acting twice.
 */
export async function automationEvaluate(data: JobPayloads["automation.evaluate"], ctx: HandlerContext) {
  const result = await evaluateTrigger(data.trigger, data.refId);
  if (result.matched || result.subjects) ctx.log.info("automations evaluated", { trigger: data.trigger, ...result });
}
