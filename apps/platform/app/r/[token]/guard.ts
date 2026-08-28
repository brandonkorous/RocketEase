import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveShare, type ShareAccess } from "@/lib/reports/access";
import { rateLimit } from "@/lib/reports/rate-limit";
import { passcodeCookieName, passcodeProof } from "@/lib/reports/share";

type Ok = Extract<ShareAccess, { status: "ok" }>;
export type Guarded = { share: Ok; ip: string | null; userAgent: string | null } | { response: NextResponse };

/**
 * Shared gate for the two public file routes: rate limit, then token, then
 * passcode. A link that once worked but no longer does answers 410 Gone; a
 * token we cannot place answers 404 and says nothing else.
 */
export async function guardShare(token: string, bucket: string, limit: number): Promise<Guarded> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ip = forwarded || null;
  if (!rateLimit(`${bucket}:${ip ?? "unknown"}`, limit, 60_000).ok) {
    return { response: new NextResponse("Too many requests", { status: 429, headers: { "Retry-After": "60" } }) };
  }

  const share = await resolveShare(token);
  if (share.status === "expired" || share.status === "revoked") {
    return { response: new NextResponse(share.status === "expired" ? "This link has expired" : "This link was revoked", { status: 410 }) };
  }
  if (share.status !== "ok") return { response: new NextResponse("Not available", { status: 404 }) };
  if (share.needsPasscode && share.passcodeHash) {
    const jar = await cookies();
    if (jar.get(passcodeCookieName(share.shareId))?.value !== passcodeProof(share.shareId, share.passcodeHash)) {
      return { response: new NextResponse("Not available", { status: 404 }) };
    }
  }
  return { share, ip, userAgent: h.get("user-agent") };
}
