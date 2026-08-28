import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { recordShareView, resolveShare } from "@/lib/reports/access";
import { rateLimit } from "@/lib/reports/rate-limit";
import { presignGet } from "@/lib/storage";
import { passcodeCookieName, passcodeProof } from "@/lib/reports/share";

export const dynamic = "force-dynamic";

const SAFE = (s: string) => s.replace(/[^\w .-]+/g, " ").trim() || "report";

/** Hands the client the file itself: the PDF when one was rendered, otherwise the source document. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`download:${ip}`, 30, 60_000).ok) return new NextResponse("Too many requests", { status: 429, headers: { "Retry-After": "60" } });

  const share = await resolveShare(token);
  if (share.status !== "ok") return new NextResponse("Not available", { status: 404 });
  if (share.needsPasscode && share.passcodeHash) {
    const jar = await cookies();
    if (jar.get(passcodeCookieName(share.shareId))?.value !== passcodeProof(share.shareId, share.passcodeHash)) return new NextResponse("Not available", { status: 404 });
  }

  const key = share.pdfKey ?? share.objectKey;
  const ext = share.pdfKey ? "pdf" : share.format;
  await recordShareView(share.shareId, { ip: ip === "unknown" ? null : ip, userAgent: h.get("user-agent") });
  const url = await presignGet(key, 300, `${SAFE(share.runName)}.${ext}`);
  return NextResponse.redirect(url);
}
