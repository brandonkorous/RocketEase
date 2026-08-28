import type { PgBoss } from "pg-boss";

/** Nightly cron jobs (UTC). Singleton keys keep re-registration idempotent across restarts. */
export const NIGHTLY: { name: "quality.check" | "publication.reconcile" | "connection.refresh" | "recommendations.compute"; cron: string }[] = [
  { name: "connection.refresh", cron: "15 2 * * *" },
  { name: "publication.reconcile", cron: "45 2 * * *" },
  { name: "quality.check", cron: "30 3 * * *" },
  { name: "recommendations.compute", cron: "10 4 * * *" },
];

export async function scheduleNightly(boss: PgBoss) {
  for (const t of NIGHTLY) await boss.schedule(t.name, t.cron, {}, { singletonKey: t.name });
}

/** Budget thresholds are also swept nightly, so a campaign whose ad account stopped importing still trips its rule. */
export async function scheduleAutomationSweep(boss: PgBoss) {
  await boss.schedule("automation.evaluate", "0 5 * * *", { trigger: "campaign.budget_threshold" as const, refId: "" }, { singletonKey: "automation.budget-sweep" });
}
