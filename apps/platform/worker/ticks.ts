import type { PgBoss } from "pg-boss";

/** Nightly cron jobs (UTC). Singleton keys keep re-registration idempotent across restarts. */
export const NIGHTLY: { name: "quality.check" | "publication.reconcile" | "connection.refresh" | "recommendations.compute" | "rights.expiring" | "billing.report_usage"; cron: string }[] = [
  { name: "connection.refresh", cron: "15 2 * * *" },
  { name: "publication.reconcile", cron: "45 2 * * *" },
  { name: "quality.check", cron: "30 3 * * *" },
  { name: "recommendations.compute", cron: "10 4 * * *" },
  { name: "rights.expiring", cron: "40 4 * * *" },
  { name: "billing.report_usage", cron: "20 5 * * *" },
];

export async function scheduleNightly(boss: PgBoss) {
  for (const t of NIGHTLY) await boss.schedule(t.name, t.cron, {}, { singletonKey: t.name });
}

/** Budget thresholds are also swept nightly, so a campaign whose ad account stopped importing still trips its rule. */
/** Evergreen recycling: hourly, so every workspace timezone gets its slot within the hour. */
export async function scheduleRecycling(boss: PgBoss) {
  await boss.schedule("recycle.tick", "5 * * * *", {}, { singletonKey: "recycle.tick" });
}

/** Approval reminders: every 5 minutes, so a reminder lands within 5 minutes of the due time. */
export async function scheduleApprovalReminders(boss: PgBoss) {
  await boss.schedule("approval.remind", "*/5 * * * *", {}, { singletonKey: "approval.remind" });
}

export async function scheduleAutomationSweep(boss: PgBoss) {
  await boss.schedule("automation.evaluate", "0 5 * * *", { trigger: "campaign.budget_threshold" as const, refId: "" }, { singletonKey: "automation.budget-sweep" });
}
