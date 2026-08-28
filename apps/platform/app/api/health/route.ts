import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/** Liveness + DB readiness for k8s probes. Never leaks config. */
export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "ok", ms: Date.now() - started });
  } catch {
    return Response.json({ ok: false, db: "unreachable" }, { status: 503 });
  }
}
