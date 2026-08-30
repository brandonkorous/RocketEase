/*
 * Readiness. A real query through the application pool, so a replica that
 * cannot get a connection leaves the Service while its healthy siblings keep
 * serving — the case /api/health missed during the 2026-08-30 outage.
 */
import { instance, readiness } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const ready = await readiness();
  return Response.json({ ok: ready.ok, instance: instance(), checks: ready.checks }, { status: ready.ok ? 200 : 503 });
}
