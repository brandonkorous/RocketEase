import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { recordShareView, resolveShare } from "@/lib/reports/access";
import { rateLimit } from "@/lib/reports/rate-limit";
import { getObjectBuffer } from "@/lib/storage";
import { passcodeCookieName, passcodeProof } from "@/lib/reports/share";

export const dynamic = "force-dynamic";

/**
 * Streams the report document itself. This is the request that counts as a
 * view, so a refresh of the wrapper page without loading the document does not
 * inflate the number. CSV runs are handed over as a download instead.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`view:${ip}`, 60, 60_000).ok) return new NextResponse("Too many requests", { status: 429, headers: { "Retry-After": "60" } });

  const share = await resolveShare(token);
  if (share.status !== "ok") return new NextResponse("Not available", { status: 404 });
  if (share.needsPasscode && share.passcodeHash) {
    const jar = await cookies();
    if (jar.get(passcodeCookieName(share.shareId))?.value !== passcodeProof(share.shareId, share.passcodeHash)) return new NextResponse("Not available", { status: 404 });
  }

  const body = await getObjectBuffer(share.objectKey);
  await recordShareView(share.shareId, { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: h.get("user-agent") });
  const isHtml = share.format === "html";
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": isHtml ? "text/html; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": isHtml ? "inline" : `attachment; filename="${share.runName.replace(/"/g, "")}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
      "Referrer-Policy": "no-referrer",
    },
  });
}
