import { PgBoss, type SendOptions } from "pg-boss";
import { log } from "@/lib/log";
import { JOB_NAMES, QUEUES, type JobName, type JobPayloads } from "./queues";

/*
 * pg-boss on the same Postgres (schema `pgboss`). The web process only sends;
 * the worker (worker/index.ts) calls `work()`. One instance per process.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const g = globalThis as unknown as { __misBoss?: Promise<PgBoss> };

export function getBoss(): Promise<PgBoss> {
  if (!g.__misBoss) {
    g.__misBoss = (async () => {
      const boss = new PgBoss({
        connectionString: url,
        schema: "pgboss",
        application_name: `rke-${process.env.RKE_PROCESS ?? "platform"}`,
        max: Number(process.env.PGBOSS_POOL_MAX ?? 3),
      });
      boss.on("error", (err: Error) => log.error("pg-boss error", { err }));
      await boss.start();
      for (const name of JOB_NAMES) await boss.createQueue(name, QUEUES[name]);
      return boss;
    })();
  }
  return g.__misBoss;
}

/** Type-safe enqueue. Returns the job id (null if deduplicated by singleton/id). */
export async function enqueue<N extends JobName>(
  name: N,
  data: JobPayloads[N],
  options: SendOptions = {},
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(name, data, options);
}

export async function stopBoss() {
  if (!g.__misBoss) return;
  const boss = await g.__misBoss;
  await boss.stop({ graceful: true, timeout: 15_000 });
  g.__misBoss = undefined;
}
