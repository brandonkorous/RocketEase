import type { JobName, JobPayloads } from "@/lib/jobs/queues";
import type { Logger } from "@/lib/log";
import { sendMailJob } from "./mail";
import { channelSync } from "./channel-sync";
import { assetProcess } from "./asset-process";
import { publishExecute } from "./publish";
import { inboxSync } from "./inbox-sync";
import { inboxReply } from "./inbox-reply";
import { webhookProcess } from "./webhook-process";
import { insightsIngest } from "./insights-ingest";
import { reportRunJob } from "./report-run";

export type HandlerContext = { log: Logger; signal: AbortSignal };
export type Handler<N extends JobName> = (data: JobPayloads[N], ctx: HandlerContext) => Promise<void>;

/**
 * One handler per queue (outbox.relay is wired directly in worker/index.ts).
 * Stubs stay registered so misrouted jobs surface as failures instead of vanishing.
 */
export const handlers: { [N in Exclude<JobName, "outbox.relay">]: Handler<N> } = {
  "mail.send": sendMailJob,
  "publish.execute": publishExecute,
  "channel.sync": channelSync,
  "webhook.process": webhookProcess,
  "insights.ingest": insightsIngest,
  "report.run": reportRunJob,
  "asset.process": assetProcess,
  "inbox.sync": inboxSync,
  "inbox.reply": inboxReply,
};
