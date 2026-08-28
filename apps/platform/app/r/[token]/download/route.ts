import { NextResponse } from "next/server";
import { recordShareView } from "@/lib/reports/access";
import { getObjectBuffer } from "@/lib/storage";
import { guardShare } from "../guard";

export const dynamic = "force-dynamic";

const SAFE = (s: string) => s.replace(/[^\w .-]+/g, " ").trim() || "report";
const TYPES: Record<string, string> = { pdf: "application/pdf", html: "text/html; charset=utf-8", csv: "text/csv; charset=utf-8" };

/**
 * Hands the client the file itself: the PDF when one was rendered, otherwise
 * the source document. Streamed through this route rather than redirected to
 * storage — a presigned URL would put the tenant's ids in the client's address
 * bar, which is exactly what the share link avoids.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guarded = await guardShare(token, "download", 30);
  if ("response" in guarded) return guarded.response;
  const { share } = guarded;

  const ext = share.pdfKey ? "pdf" : share.format;
  const body = await getObjectBuffer(share.pdfKey ?? share.objectKey);
  await recordShareView(share.shareId, { ip: guarded.ip, userAgent: guarded.userAgent });
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${SAFE(share.runName)}.${ext}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
