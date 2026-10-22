/*
 * WizeLens in the worker: one trace per pg-boss job, with the job's outgoing
 * HTTP calls (networks, AI vendors, storage) and log lines inside it. pg-boss
 * has no WizeLens adapter, so the job span is made here; app queries run on
 * postgres.js, which WizeLens does not trace yet.
 *
 * On in development, dashboard at http://localhost:5011/_wizelens (media role
 * :5012, or WIZELENS_PORT). In production only with WIZELENS_ENABLED=true, then
 * SEND-ONLY to WIZELENS_HUB. A failure to start is logged and never stops the worker.
 */
import { createServer } from "node:http";
import { join } from "node:path";
import { SpanKind, SpanStatusCode, type Attributes } from "@opentelemetry/api";
import type { WizeLens } from "@wizeworks/lens-node";
import { log } from "@/lib/log";
import type { WorkerRole } from "@/lib/jobs/queues";

// The worker runs under tsx with NODE_ENV unset in development.
const DEVELOPMENT = (process.env.NODE_ENV ?? "development") === "development";
const FLAG = process.env.WIZELENS_ENABLED;
const ENABLED = FLAG === "true" || (FLAG !== "false" && DEVELOPMENT);

let lens: WizeLens | undefined;
let category = "wizelens.category";

export async function startWizeLens(role: WorkerRole): Promise<void> {
  if (!ENABLED) return;
  try {
    const mod = await import("@wizeworks/lens-node");
    const name = role === "media" ? "media-worker" : "worker";
    // Its own file: the Next app keeps .wizelens/traces.db in the same folder.
    const storagePath = join(process.cwd(), ".wizelens", `${name}.db`);
    lens = mod.createWizeLens({ serviceName: `rocketease-${name}`, enabled: true, storagePath });
    category = mod.CATEGORY_ATTR;
    if (DEVELOPMENT) serveDashboard(lens, Number(process.env.WIZELENS_PORT ?? (role === "media" ? 5012 : 5011)));
  } catch (err) {
    log.warn("wizelens did not start", { err });
  }
}

/** The worker has no HTTP server, so the local dashboard gets one of its own. */
function serveDashboard(wizelens: WizeLens, port: number) {
  createServer((req, res) => {
    void wizelens.handler(req, res).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  })
    .on("error", (err) => log.warn("wizelens dashboard did not start", { err, port }))
    .listen(port, () => log.info("wizelens dashboard", { url: `http://localhost:${port}${wizelens.basePath}` }));
}

/** Run one job as its own trace. Without WizeLens it simply runs. */
export function traceJob<T>(queue: string, jobId: string, attributes: Attributes, fn: () => Promise<T>): Promise<T> {
  if (!lens) return fn();
  const attrs: Attributes = {
    ...attributes,
    [category]: "messaging",
    "messaging.system": "pg-boss",
    "messaging.operation.type": "process",
    "messaging.destination.name": queue,
    "messaging.message.id": jobId,
  };
  return lens.tracer.startActiveSpan(`process ${queue}`, { root: true, kind: SpanKind.CONSUMER, attributes: attrs }, async (span) => {
    try {
      return await fn();
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}
