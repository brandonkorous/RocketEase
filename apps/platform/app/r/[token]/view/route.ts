import { NextResponse } from "next/server";
import { recordShareView } from "@/lib/reports/access";
import { getObjectBuffer } from "@/lib/storage";
import { guardShare } from "../guard";

export const dynamic = "force-dynamic";

/**
 * Streams the report document itself. This is the request that counts as a
 * view, so a refresh of the wrapper page without loading the document does not
 * inflate the number. CSV runs are handed over as a download instead.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guarded = await guardShare(token, "view", 60);
  if ("response" in guarded) return guarded.response;
  const { share } = guarded;

  const body = await getObjectBuffer(share.objectKey);
  await recordShareView(share.shareId, { ip: guarded.ip, userAgent: guarded.userAgent });
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
