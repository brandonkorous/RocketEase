/*
 * The operator view. Never wire a probe to this — it reports conditions that
 * are true of the whole cluster, and a probe must only judge its own pod.
 * Probes use /api/health/live and /api/health/ready.
 */
import { connectionHeadroom, instance, readiness, timed } from "@/lib/health";
import { storageReachable } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const [ready, storage, connections] = await Promise.all([readiness(), timed(() => storageReachable()), connectionHeadroom()]);
  const degraded = ready.ok && (storage.status !== "ok" || connections.status === "low");
  return Response.json(
    // A poll through the Service reaches one replica of N; `instance` says which.
    { ok: ready.ok, degraded, instance: instance(), checks: { ...ready.checks, storage }, connections },
    { status: ready.ok ? 200 : 503 },
  );
}
