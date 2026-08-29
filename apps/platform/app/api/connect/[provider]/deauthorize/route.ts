import { NextResponse } from "next/server";
import { enqueue } from "@/lib/jobs/boss";
import { getAdapter, isProviderKey } from "@/lib/providers";
import { recordDeletionRequest } from "@/lib/provider-deletion";
import { log } from "@/lib/log";
import { signedRequestFrom } from "../signed-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deauthorize callback: the provider tells us someone removed our app from
 * their account. Meta requires this URL to publish an app and re-tests it after
 * launch, so it must actually erase — not just acknowledge.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProviderKey(provider)) return new NextResponse("unknown provider", { status: 404 });

  const adapter = getAdapter(provider);
  if (!adapter.parseSignedRequest) return new NextResponse("unsupported", { status: 404 });

  const raw = await signedRequestFrom(req);
  const parsed = raw ? adapter.parseSignedRequest(raw) : null;
  if (!parsed) return new NextResponse("bad signature", { status: 401 });

  const request = await recordDeletionRequest({ provider, kind: "deauthorize", remoteUserId: parsed.remoteUserId });
  await enqueue("provider.deletion", { requestId: request.id });
  log.info("deauthorize received", { provider, requestId: request.id });

  return NextResponse.json({ ok: true });
}
