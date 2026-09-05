/*
 * Everything the GENERAL worker runs on a timer: the outbox relay, the polling
 * tickers, and the cron-scheduled nightly maintenance.
 *
 * All of it is exclusive to one role on purpose — a media worker running these
 * too would double every scheduled sweep and every enqueue.
 */
import type { PgBoss } from "pg-boss";
import { relayOutbox, pruneOutbox } from "@/lib/jobs/outbox";
import { log } from "@/lib/log";
import type { JobPayloads } from "@/lib/jobs/queues";
import { enqueueInboxSyncs } from "@/lib/engagement/schedule";
import { enqueueInsightsIngests } from "@/lib/analytics/schedule";
import { enqueueAdsSyncs } from "@/lib/campaigns/schedule";
import { enqueueTrackingSyncs } from "@/lib/tracking/schedule";
import { enqueueMediaPolls } from "@/lib/media/schedule";
import { enqueueDueReports } from "./handlers/report-run";
import { scheduleApprovalReminders, scheduleAutomationSweep, scheduleNightly, scheduleRecycling } from "./ticks";

/** A ticker that never lets a rejection escape, and never holds the process open. */
function every(ms: number, firstAfter: number, name: string, fn: () => Promise<unknown>) {
  const tick = () => void fn().catch((err) => log.error(`${name} tick failed`, { err }));
  setTimeout(tick, firstAfter).unref();
  setInterval(tick, ms).unref();
}

export async function startGeneralSchedules(boss: PgBoss): Promise<void> {
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
  every(120_000, 10_000, "inbox poll enqueue", enqueueInboxSyncs);
  // Organic insights: providers publish daily; re-pull a short tail every 15 minutes.
  every(15 * 60_000, 20_000, "insights enqueue", enqueueInsightsIngests);
  // Scheduled reports: check for due definitions every 5 minutes.
  every(5 * 60_000, 30_000, "report schedule", enqueueDueReports);
  // Paid imports: ad accounts restate recent days; re-pull a short tail every 30 minutes.
  every(30 * 60_000, 40_000, "ads sync enqueue", enqueueAdsSyncs);
  // Conversion sources: GA4/Shopify restate recent days; re-pull a 3-day tail every hour.
  every(60 * 60_000, 50_000, "tracking sync enqueue", enqueueTrackingSyncs);
  // Running generations. Tight, because this one is racing a delivery URL that
  // expires with money already spent behind it (docs/bugs/B-008). The media
  // worker executes the sweep; this only asks for it.
  every(15_000, 5_000, "media poll enqueue", enqueueMediaPolls);

  // Nightly maintenance (5.7 data quality, M7 reliability): cron-scheduled singletons.
  await scheduleNightly(boss);
  await scheduleAutomationSweep(boss);
  await scheduleRecycling(boss);
  await scheduleApprovalReminders(boss);
}
