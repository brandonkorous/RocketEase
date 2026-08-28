import type { PgBoss } from "pg-boss";

/** Nightly cron jobs (UTC). Singleton keys keep re-registration idempotent across restarts. */
export const NIGHTLY: { name: "quality.check" | "publication.reconcile" | "connection.refresh"; cron: string }[] = [
  { name: "connection.refresh", cron: "15 2 * * *" },
  { name: "publication.reconcile", cron: "45 2 * * *" },
  { name: "quality.check", cron: "30 3 * * *" },
];

export async function scheduleNightly(boss: PgBoss) {
  for (const t of NIGHTLY) await boss.schedule(t.name, t.cron, {}, { singletonKey: t.name });
}
