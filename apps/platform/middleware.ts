import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/*
 * Optimistic redirect only. The cookie check proves nothing about validity —
 * every server operation re-validates the session and tenant scope
 * (see lib/session.ts). This just keeps anonymous users off app routes.
 */
// "/r" is the public client-report surface: signed, expiring share tokens carry their own proof (lib/reports/access.ts).
// "/api/scim" carries its own per-organization bearer token (lib/scim/auth.ts), never a session cookie.
const PUBLIC = ["/login", "/signup", "/api/auth", "/api/health", "/api/webhooks", "/api/connect/mock/authorize", "/invite", "/r/", "/api/scim"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));
  const hasSession = Boolean(getSessionCookie(req));

  // Correlation id for logs/audit (NFR-008). Honour an upstream one from the ingress.
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  if (!hasSession && !isPublic) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    const res = NextResponse.redirect(url);
    res.headers.set("x-request-id", requestId);
    return res;
  }
  // Signed-in users hitting /login or /signup are redirected by those pages
  // after a REAL session check — a stale cookie must not cause a loop here.
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};
