import type { JobPayloads } from "@/lib/jobs/queues";
import { reportAiOverage } from "@/lib/billing/ai-overage";
import type { HandlerContext } from "./index";

/** Nightly + period-end: AI credits above the allowance → Stripe billing meter (M8.9). */
export async function billingReportUsage(_data: JobPayloads["billing.report_usage"], ctx: HandlerContext) {
  const summary = await reportAiOverage();
  ctx.log.info("ai overage reported", summary);
}
