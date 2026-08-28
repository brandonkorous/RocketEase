import type { JobPayloads } from "@/lib/jobs/queues";
import { resumeRun } from "@/lib/automations/apply";
import type { HandlerContext } from "./index";

/** Resume an automation run after a person cleared its approval gate. */
export async function automationApply(data: JobPayloads["automation.apply"], ctx: HandlerContext) {
  const result = await resumeRun(data.runId);
  ctx.log.info("automation run resumed", { runId: data.runId, ...result });
}
