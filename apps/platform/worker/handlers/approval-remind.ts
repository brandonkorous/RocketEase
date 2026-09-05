import type { JobPayloads } from "@/lib/jobs/queues";
import { sweepOverdueApprovals } from "@/lib/approvals/due";
import type { HandlerContext } from "./index";

/** Every 5 minutes: one reminder per approval request that has just gone past due (M14.3). */
export async function approvalRemind(_data: JobPayloads["approval.remind"], ctx: HandlerContext) {
  const reminded = await sweepOverdueApprovals();
  if (reminded > 0) ctx.log.info("approval reminders sent", { reminded });
}
