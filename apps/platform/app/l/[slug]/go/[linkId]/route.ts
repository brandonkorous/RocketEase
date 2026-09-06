import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { bioLink, bioPage } from "@/db/schema/bio";
import { recordClick } from "@/lib/bio/clicks";
import { isPublicLink } from "@/lib/bio/rules";
import { rateLimit } from "@/lib/reports/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The way out. Every link on a live page goes through here, so a click is a
 * row before it is a redirect. A link that is off, empty, or on a hidden page
 * is a 404, never a hint about what exists.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; linkId: string }> }) {
  const { slug, linkId } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`bio-go:${ip}`, 240, 60_000).ok) return new NextResponse("Too many requests", { status: 429 });
  const [row] = await db
    .select({ link: bioLink, timezone: workspace.timezone })
    .from(bioLink)
    .innerJoin(bioPage, and(eq(bioPage.id, bioLink.pageId), eq(bioPage.slug, slug), eq(bioPage.live, true)))
    .innerJoin(workspace, eq(workspace.id, bioPage.workspaceId))
    .where(eq(bioLink.id, linkId))
    .limit(1);
  if (!row || !isPublicLink(row.link)) return new NextResponse("Not found", { status: 404 });
  await recordClick(row.link, row.timezone);
  return NextResponse.redirect(row.link.url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
