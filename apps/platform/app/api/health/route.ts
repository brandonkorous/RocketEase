import { sql } from "drizzle-orm";
import { db } from "@/db";
import { storageReachable } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Check = { status: "ok" | "fail"; ms: number; detail?: string };

async function timed(fn: () => Promise<unknown>, timeoutMs = 3000): Promise<Check> {
  const started = Date.now();
  try {
    await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs))]);
    return { status: "ok", ms: Date.now() - started };
  } catch (err) {
    // Detail is the error class only: never config, hosts, or credentials.
    return { status: "fail", ms: Date.now() - started, detail: err instanceof Error ? err.name : "error" };
  }
}

/**
 * Readiness/liveness for k8s probes: DB, queue (pg-boss schema reachable) and
 * storage (bucket HEAD). Storage failing marks the app degraded, not down.
 */
export async function GET() {
  const [dbCheck, queue, storage] = await Promise.all([
    timed(() => db.execute(sql`select 1`)),
    timed(() => db.execute(sql`select 1 from pgboss.queue limit 1`)),
    timed(() => storageReachable()),
  ]);
  const ok = dbCheck.status === "ok" && queue.status === "ok";
  return Response.json({ ok, degraded: ok && storage.status !== "ok", checks: { db: dbCheck, queue, storage } }, { status: ok ? 200 : 503 });
}
