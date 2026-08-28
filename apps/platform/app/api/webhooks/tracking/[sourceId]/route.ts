import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversionEvent } from "@/db/schema/tracking";
import { enqueue } from "@/lib/jobs/boss";
import { log } from "@/lib/log";
import { openTrackingSecret } from "@/lib/tracking/sources";
import { parseWebhookBody, SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyWebhook } from "@/lib/tracking/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 512 * 1024;
const REASONS: Record<string, string> = { missing_signature: "signature or timestamp header missing", stale_timestamp: "timestamp outside the accepted window", bad_signature: "signature did not verify" };

/**
 * Generic conversion webhook (analytics.md "Traffic"/"Campaign attribution").
 * Fast-ack: verify the HMAC, record each event under its dedupe id, then let
 * `tracking.sync` recompute the affected days' facts from the ledger.
 */
export async function POST(req: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await params;
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload too large" }, { status: 413 });

  const source = await db.query.trackingSource.findFirst({ where: (s, { eq }) => eq(s.id, sourceId) });
  // A wrong id and a disconnected source answer alike: no existence leak across tenants.
  if (!source || source.kind !== "webhook" || source.disconnectedAt || !source.secret) return NextResponse.json({ error: "unknown source" }, { status: 404 });

  const cred = openTrackingSecret(source);
  if (cred.kind !== "webhook") return NextResponse.json({ error: "unknown source" }, { status: 404 });
  const verified = verifyWebhook({ secret: cred.signingSecret, rawBody, signature: req.headers.get(SIGNATURE_HEADER), timestamp: req.headers.get(TIMESTAMP_HEADER) });
  if (!verified.ok) return NextResponse.json({ error: REASONS[verified.reason] }, { status: 401 });

  const parsed = parseWebhookBody(rawBody);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  let stored = 0;
  for (const e of parsed.events) {
    const [row] = await db
      .insert(conversionEvent)
      .values({ organizationId: source.organizationId, workspaceId: source.workspaceId, sourceId: source.id, eventId: e.eventId, occurredAt: e.occurredAt, day: e.day, count: e.count, value: String(e.value), currency: e.currency ?? null, dimension: e.dimension, dimensionHash: e.dimensionHash })
      .onConflictDoNothing()
      .returning({ id: conversionEvent.id });
    if (row) stored++;
  }
  if (stored) {
    const since = parsed.events.reduce((min, e) => (e.day < min ? e.day : min), parsed.events[0].day);
    await enqueue("tracking.sync", { sourceId: source.id, since }, { singletonKey: `tracking.sync:${source.id}`, singletonSeconds: 60 });
  }
  log.info("conversion webhook received", { sourceId: source.id, received: parsed.events.length, stored });
  return NextResponse.json({ received: parsed.events.length, stored, duplicates: parsed.events.length - stored });
}
