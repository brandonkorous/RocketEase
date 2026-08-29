import { NextResponse } from "next/server";
import { enqueue } from "@/lib/jobs/boss";
import { getAdapter, isProviderKey } from "@/lib/providers";
import { recordDeletionRequest } from "@/lib/provider-deletion";
import { log } from "@/lib/log";
import { signedRequestFrom } from "../signed-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const baseUrl = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";

/**
 * Data Deletion Request callback. Meta expects exactly `{ url, confirmation_code }`
 * back, and the url must show the requester the status of their request. The
 * erasure itself runs through the outbox so the response stays fast and the work
 * survives a restart.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProviderKey(provider)) return new NextResponse("unknown provider", { status: 404 });

  const adapter = getAdapter(provider);
  if (!adapter.parseSignedRequest) return new NextResponse("unsupported", { status: 404 });

  const raw = await signedRequestFrom(req);
  const parsed = raw ? adapter.parseSignedRequest(raw) : null;
  if (!parsed) return new NextResponse("bad signature", { status: 401 });

  const request = await recordDeletionRequest({ provider, kind: "data_deletion", remoteUserId: parsed.remoteUserId });
  await enqueue("provider.deletion", { requestId: request.id });
  log.info("data deletion requested", { provider, requestId: request.id });

  return NextResponse.json({
    url: `${baseUrl()}/data-deletion/${request.confirmationCode}`,
    confirmation_code: request.confirmationCode,
  });
}
