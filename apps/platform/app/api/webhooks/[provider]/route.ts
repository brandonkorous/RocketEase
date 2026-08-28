import { NextResponse } from "next/server";
import { db } from "@/db";
import { webhookReceipt } from "@/db/schema/connections";
import { enqueue } from "@/lib/jobs/boss";
import { getAdapter, isProviderKey } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Provider subscription handshake (Meta hub.challenge). */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProviderKey(provider)) return new NextResponse("unknown provider", { status: 404 });
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const adapter = getAdapter(provider);
  if (adapter.verifyWebhook?.({ headers: {}, rawBody: "", query })) return new NextResponse(query["hub.challenge"] ?? "ok");
  return new NextResponse("forbidden", { status: 403 });
}

/** Fast-ack ingestion: verify, store one receipt per event (dedupe), enqueue processing. */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProviderKey(provider)) return new NextResponse("unknown provider", { status: 404 });
  const adapter = getAdapter(provider);
  const rawBody = await req.text();
  const headers = Object.fromEntries([...req.headers.entries()]);
  if (!adapter.verifyWebhook?.({ headers, rawBody })) return new NextResponse("bad signature", { status: 401 });
  let events;
  try {
    events = adapter.parseWebhook?.(rawBody) ?? [];
  } catch {
    return new NextResponse("bad payload", { status: 400 });
  }
  let queued = 0;
  for (const e of events) {
    const [row] = await db.insert(webhookReceipt).values({ provider, eventId: e.eventId, channelRemoteId: e.channelRemoteId ?? null, payload: e }).onConflictDoNothing().returning({ id: webhookReceipt.id });
    if (!row) continue;
    await enqueue("webhook.process", { receiptId: row.id });
    queued++;
  }
  return NextResponse.json({ received: events.length, queued });
}
