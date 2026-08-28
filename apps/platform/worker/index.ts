/*
 * Background worker entrypoint. Runs as its own container (Dockerfile.worker)
 * and locally via `pnpm worker`. Handlers live in worker/handlers/*.
 *
 * Every handler receives a batch (pg-boss v12 hands arrays); keep them
 * idempotent — a job may be delivered again after an expiry or crash.
 */
import "./env";
import { getBoss, stopBoss } from "@/lib/jobs/boss";
import { relayOutbox, pruneOutbox } from "@/lib/jobs/outbox";
import { log } from "@/lib/log";
import { withSpan } from "@/lib/otel";
import type { JobPayloads } from "@/lib/jobs/queues";
import { handlers } from "./handlers";
import { enqueueInboxSyncs } from "@/lib/engagement/schedule";
import { enqueueInsightsIngests } from "@/lib/analytics/schedule";
import { enqueueAdsSyncs } from "@/lib/campaigns/schedule";
import { enqueueDueReports } from "./handlers/report-run";
import { scheduleNightly, scheduleAutomationSweep } from "./ticks";

async function main() {
  const boss = await getBoss();

  // Outbox relay: a singleton job re-scheduled every 5s, plus a cron fallback.
  await boss.work<JobPayloads["outbox.relay"]>("outbox.relay", { pollingIntervalSeconds: 2 }, async () => {
    const n = await relayOutbox();
    if (n) log.info("outbox relayed", { count: n });
  });
  await boss.schedule("outbox.relay", "* * * * *", {}, { singletonKey: "outbox.relay" });
  // Keep the relay tight in between cron ticks.
  setInterval(() => void relayOutbox().catch((err) => log.error("outbox relay tick failed", { err })), 5_000).unref();
  setInterval(() => void pruneOutbox().catch(() => {}), 6 * 3_600_000).unref();
  // Inbox polling for channels without (or alongside) webhooks.
  const pollInbox = () => void enqueueInboxSyncs().catch((err) => log.error("inbox poll enqueue failed", { err }));
  setTimeout(pollInbox, 10_000).unref();
  setInterval(pollInbox, 120_000).unref();
  // Organic insights: providers publish daily; re-pull a short tail every 15 minutes.
  const pollInsights = () => void enqueueInsightsIngests().catch((err) => log.error("insights enqueue failed", { err }));
  setTimeout(pollInsights, 20_000).unref();
  setInterval(pollInsights, 15 * 60_000).unref();
  // Scheduled reports: check for due definitions every 5 minutes.
  const pollReports = () => void enqueueDueReports().catch((err) => log.error("report schedule tick failed", { err }));
  setTimeout(pollReports, 30_000).unref();
  setInterval(pollReports, 5 * 60_000).unref();
  // Paid imports: ad accounts restate recent days; re-pull a short tail every 30 minutes.
  const pollAds = () => void enqueueAdsSyncs().catch((err) => log.error("ads sync enqueue failed", { err }));
  setTimeout(pollAds, 40_000).unref();
  setInterval(pollAds, 30 * 60_000).unref();

  // Nightly maintenance (5.7 data quality, M7 reliability): cron-scheduled singletons.
  await scheduleNightly(boss);
  await scheduleAutomationSweep(boss);

  type HandlerName = keyof typeof handlers;
  for (const [name, handler] of Object.entries(handlers) as [HandlerName, (typeof handlers)[HandlerName]][]) {
    await boss.work<JobPayloads[HandlerName]>(name, { batchSize: 5, pollingIntervalSeconds: 2 }, async (jobs) => {
      for (const job of jobs) {
        const l = log.child({ jobId: job.id, job: name });
        const started = Date.now();
        try {
          const d = job.data as { workspaceId?: string; organizationId?: string };
          const attrs = { "job.name": name, "job.id": job.id, "tenant.workspace_id": d?.workspaceId ?? "", "tenant.organization_id": d?.organizationId ?? "" };
          await withSpan(`job ${name}`, attrs, () => handler(job.data as never, { log: l, signal: job.signal }));
          l.info("job done", { ms: Date.now() - started });
        } catch (err) {
          l.error("job failed", { ms: Date.now() - started, err });
          throw err; // let pg-boss apply the queue's retry policy
        }
      }
    });
  }

  log.info("worker ready", { queues: Object.keys(handlers) });

  const shutdown = async (sig: string) => {
    log.info("worker stopping", { sig });
    await stopBoss();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  log.error("worker crashed", { err });
  process.exit(1);
});
