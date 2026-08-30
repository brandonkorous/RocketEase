/*
 * Health for two different readers, which is why there are three endpoints.
 *
 * Liveness asks only "is this process running". It must never touch the
 * database: a probe that restarts a pod because Postgres is busy turns a
 * degradation into an outage, and does it to every replica at once.
 *
 * Readiness asks "can THIS replica serve", so it runs a real query through the
 * application pool. On 2026-08-30 the replicas that had already opened their
 * connections kept working while a later one could open none — that is exactly
 * the difference this check sees and a privileged side channel does not.
 *
 * The operator view adds server-wide connection headroom and names the replica
 * that answered, because polling through a Service hides which one you reached.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type Check = { status: "ok" | "fail"; ms: number; detail?: string };

const BUDGET_MS = Number(process.env.HEALTH_QUERY_TIMEOUT_MS ?? 2000);
/** Free slots the server must still have before we stop calling the cluster healthy. */
const MIN_FREE = Number(process.env.HEALTH_MIN_FREE_CONNECTIONS ?? 3);

/** The replica that answered. k8s sets HOSTNAME to the pod name. */
export const instance = () => process.env.HOSTNAME ?? "unknown";

export async function timed(fn: () => Promise<unknown>, timeoutMs = BUDGET_MS): Promise<Check> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([fn(), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), timeoutMs); })]);
    return { status: "ok", ms: Date.now() - started };
  } catch (err) {
    // Detail is the error class only: never config, hosts, or credentials.
    return { status: "fail", ms: Date.now() - started, detail: err instanceof Error ? err.name : "error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Can this replica serve a request? Both queries go through the application
 * pool, so a pod that cannot get a connection fails here and leaves the
 * Service — which is the whole point of a readiness probe.
 */
export async function readiness(): Promise<{ ok: boolean; checks: { db: Check; queue: Check } }> {
  const [dbCheck, queue] = await Promise.all([
    timed(() => db.execute(sql`select 1`)),
    timed(() => db.execute(sql`select 1 from pgboss.queue limit 1`)),
  ]);
  return { ok: dbCheck.status === "ok" && queue.status === "ok", checks: { db: dbCheck, queue } };
}

export type Headroom = { status: "ok" | "low" | "unknown"; max?: number; used?: number; free?: number; detail?: string };

/**
 * Server-wide connection slots — the condition that broke production on
 * 2026-08-30 and that every per-replica check missed. Reported as degraded,
 * never as `ok: false`: it is true of every replica at once, so failing
 * readiness on it would empty the Service instead of shedding a bad pod.
 */
export async function connectionHeadroom(): Promise<Headroom> {
  try {
    const res = await db.execute(sql`select (select setting::int from pg_settings where name = 'max_connections') as max, (select count(*)::int from pg_stat_activity) as used`);
    const row = (res as unknown as { max: number | null; used: number | null }[])[0];
    if (row?.max == null || row?.used == null) return { status: "unknown", detail: "not reported" };
    const free = row.max - row.used;
    return { status: free <= MIN_FREE ? "low" : "ok", max: row.max, used: row.used, free };
  } catch (err) {
    return { status: "unknown", detail: err instanceof Error ? err.name : "error" };
  }
}
