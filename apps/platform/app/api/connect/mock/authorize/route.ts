import { NextResponse, type NextRequest } from "next/server";
import { mockControl } from "@make-it-social/providers";

export const dynamic = "force-dynamic";

/**
 * Stand-in for a provider's consent screen. Only mounted when the mock
 * provider is enabled (dev/test). Deliberately looks nothing like our app.
 */
function enabled() {
  return process.env.PROVIDERS_ENABLE_MOCK === "1";
}

export async function GET(req: NextRequest) {
  if (!enabled()) return new NextResponse("Not found", { status: 404 });
  const q = req.nextUrl.searchParams;
  const state = q.get("state") ?? "";
  const redirect = q.get("redirect_uri") ?? "";
  const scope = (q.get("scope") ?? "").split(" ").filter(Boolean);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Demo network — Authorize</title>
<style>body{font-family:system-ui,sans-serif;background:#1d4ed8;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#fff;color:#111;border-radius:12px;padding:32px;width:380px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
h1{font-size:20px;margin:0 0 8px}ul{padding-left:18px;color:#444;font-size:14px}button{width:100%;padding:12px;border:0;border-radius:8px;font-weight:600;cursor:pointer}
.ok{background:#1d4ed8;color:#fff;margin-top:16px}.no{background:#eee;color:#333;margin-top:8px}</style></head>
<body><form method="post" class="card"><h1>Demo network</h1><p style="font-size:14px;color:#444">Make It Social is asking to:</p>
<ul>${scope.map((s) => `<li>${s}</li>`).join("")}</ul>
<input type="hidden" name="state" value="${state}"><input type="hidden" name="redirect_uri" value="${redirect}">
<button class="ok" name="decision" value="allow">Allow</button><button class="no" name="decision" value="deny">Cancel</button></form></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(req: NextRequest) {
  if (!enabled()) return new NextResponse("Not found", { status: 404 });
  const fd = await req.formData();
  const redirect = new URL(String(fd.get("redirect_uri")));
  redirect.searchParams.set("state", String(fd.get("state")));
  if (fd.get("decision") === "allow") redirect.searchParams.set("code", mockControl.issueCode());
  else {
    redirect.searchParams.set("error", "access_denied");
    redirect.searchParams.set("error_description", "The user cancelled");
  }
  return NextResponse.redirect(redirect, 303);
}
