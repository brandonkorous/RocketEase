/*
 * Background worker entrypoint. Runs as its own container (Dockerfile.worker)
 * and locally via `pnpm worker`. Handlers live in worker/handlers/*.
 *
 * Every handler receives a batch (pg-boss v12 hands arrays); keep them
 * idempotent — a job may be delivered again after an expiry or crash.
 *
 * Two roles, one image. WORKER_ROLE=media takes the CPU-bound ffmpeg and long
 * vendor-poll queues so a render cannot starve inbox.sync; anything else is the
 * general worker, which also owns every timer. The role→queue mapping lives in
 * lib/jobs/queues.ts so a new queue cannot end up owned by neither process.
 */
import "./env";
import { getBoss, stopBoss } from "@/lib/jobs/boss";
import { log } from "@/lib/log";
import { ensureStorage } from "@/lib/storage";
import { withSpan } from "@/lib/otel";
import { queuesForRole, type JobName, type JobPayloads, type WorkerRole } from "@/lib/jobs/queues";
import { handlers } from "./handlers";
import { startGeneralSchedules } from "./schedules";

function workerRole(): WorkerRole {
  return process.env.WORKER_ROLE === "media" ? "media" : "general";
}

async function main() {
  const role = workerRole();
  const owned = new Set<JobName>(queuesForRole(role));

  // Local dev only (STORAGE_AUTO_CREATE_BUCKET): make sure the media bucket is
  // there before any asset job runs. It lives here rather than in the Next
  // instrumentation hook because that hook is also compiled for the edge
  // runtime, where `node:crypto` cannot be bundled.
  await ensureStorage();
  const boss = await getBoss();

  if (role === "general") await startGeneralSchedules(boss);

  type HandlerName = keyof typeof handlers;
  for (const [name, handler] of Object.entries(handlers) as [HandlerName, (typeof handlers)[HandlerName]][]) {
    if (!owned.has(name)) continue;
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

  log.info("worker ready", { role, queues: [...owned] });

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
