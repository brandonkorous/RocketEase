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
import { qualityCheck } from "./quality-check";
import { publicationReconcile } from "./publication-reconcile";
import { connectionRefresh } from "./connection-refresh";
import { adsSync } from "./ads-sync";
import { promotionExecute } from "./promotion-execute";
import { recommendationsCompute } from "./recommendations-compute";
import { automationEvaluate } from "./automation-evaluate";
import { automationApply } from "./automation-apply";
import { trackingSync } from "./tracking-sync";
import { recycleTick } from "./recycle-tick";
import { rightsExpiring } from "./rights-expiring";
import { billingReportUsage } from "./billing-report-usage";
import { providerDeletion } from "./provider-deletion";
import { mediaGenerate } from "./media-generate";
import { mediaPoll } from "./media-poll";
import { mediaRender } from "./media-render";
import { mediaTranscribe } from "./media-transcribe";

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
  "media.generate": mediaGenerate,
  "media.poll": mediaPoll,
  "media.render": mediaRender,
  "media.transcribe": mediaTranscribe,
  "inbox.sync": inboxSync,
  "inbox.reply": inboxReply,
  "quality.check": qualityCheck,
  "publication.reconcile": publicationReconcile,
  "connection.refresh": connectionRefresh,
  "provider.deletion": providerDeletion,
  "ads.sync": adsSync,
  "promotion.execute": promotionExecute,
  "recommendations.compute": recommendationsCompute,
  "automation.evaluate": automationEvaluate,
  "automation.apply": automationApply,
  "tracking.sync": trackingSync,
  "rights.expiring": rightsExpiring,
  "recycle.tick": recycleTick,
  "billing.report_usage": billingReportUsage,
};
