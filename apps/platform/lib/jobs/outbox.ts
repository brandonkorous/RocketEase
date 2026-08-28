import { asc, eq, isNull, lt, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { outboxEvent } from "@/db/schema/app";
import { log } from "@/lib/log";
import { enqueue } from "./boss";
import type { JobName, JobPayloads } from "./queues";

/*
 * Transactional outbox (architecture.md "Request and job patterns").
 *
 * Write the domain change AND the outbox row in one transaction via
 * `emit(tx, ...)`; the worker's `outbox.relay` job moves rows into pg-boss.
 * If the process dies between commit and relay, the row is still there.
 */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function emit<N extends JobName>(
  tx: Tx | Db,
  name: N,
  payload: JobPayloads[N],
  opts: { organizationId?: string | null; workspaceId?: string | null; dedupeKey?: string | null; runAt?: Date | null } = {},
) {
  await tx.insert(outboxEvent).values({
    jobName: name,
    payload,
    organizationId: opts.organizationId ?? null,
    workspaceId: opts.workspaceId ?? null,
    dedupeKey: opts.dedupeKey ?? null,
    runAt: opts.runAt ?? null,
  });
}

const BATCH = 100;
const MAX_ATTEMPTS = 10;

/** Relay up to BATCH pending rows. Returns how many were relayed. Safe to run concurrently (row locks). */
export async function relayOutbox(): Promise<number> {
  let relayed = 0;
  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(outboxEvent)
      .where(isNull(outboxEvent.relayedAt))
      .orderBy(asc(outboxEvent.createdAt))
      .limit(BATCH)
      .for("update", { skipLocked: true });

    for (const row of rows) {
      if (row.attempts >= MAX_ATTEMPTS) {
        await tx
          .update(outboxEvent)
          .set({ relayedAt: new Date(), lastError: `gave up after ${row.attempts} attempts` })
          .where(eq(outboxEvent.id, row.id));
        log.error("outbox: giving up", { outboxId: row.id, jobName: row.jobName });
        continue;
      }
      try {
        await enqueue(row.jobName as JobName, row.payload as never, {
          id: row.id, // pg-boss dedupes on id → relay is idempotent
          singletonKey: row.dedupeKey ?? undefined,
          startAfter: row.runAt ?? undefined,
        });
        await tx.update(outboxEvent).set({ relayedAt: new Date(), lastError: null }).where(eq(outboxEvent.id, row.id));
        relayed++;
      } catch (err) {
        await tx
          .update(outboxEvent)
          .set({ attempts: sql`${outboxEvent.attempts} + 1`, lastError: err instanceof Error ? err.message : String(err) })
          .where(eq(outboxEvent.id, row.id));
        log.warn("outbox: relay failed", { outboxId: row.id, jobName: row.jobName, err });
      }
    }
  });
  return relayed;
}

/** Old relayed rows are pruned by the worker on a schedule. */
export async function pruneOutbox(olderThanDays = 7) {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  await db.delete(outboxEvent).where(lt(outboxEvent.relayedAt, cutoff));
}
