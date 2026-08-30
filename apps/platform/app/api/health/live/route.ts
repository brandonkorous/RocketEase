/*
 * Liveness. Deliberately answers without touching the database or storage:
 * restarting a pod because a shared dependency is busy makes the outage worse,
 * and a liveness probe does it to every replica at once.
 */
import { instance } from "@/lib/health";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, instance: instance(), uptimeSeconds: Math.round(process.uptime()) });
}
