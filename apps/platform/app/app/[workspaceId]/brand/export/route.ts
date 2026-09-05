import { NextResponse } from "next/server";
import { buildBrandDocument } from "@/lib/brand/export/build";
import { renderBrandKitHtml } from "@/lib/brand/export/render";
import { pdfConfigured, renderPdf } from "@/lib/reports/pdf";
import { requireWorkspace } from "@/lib/session";

export const dynamic = "force-dynamic";

const fileName = (name: string, ext: string) => `${name.replace(/[^\w .-]+/g, " ").replace(/\s+/g, " ").trim() || "Brand"} brand kit.${ext}`;

/**
 * The kit as one self-contained HTML file — or a PDF when a Chromium renderer is
 * configured (REPORT_CHROMIUM_PATH), never a renamed HTML file. Any member may download it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await requireWorkspace(workspaceId);
  const wantPdf = new URL(req.url).searchParams.get("format") === "pdf";
  const doc = await buildBrandDocument({ id: workspaceId, name: ctx.workspace.name, organizationId: ctx.workspace.organizationId, timezone: ctx.workspace.timezone });
  const html = await renderBrandKitHtml(doc);
  const name = doc.kit.identity.displayName || ctx.workspace.name;
  if (wantPdf) {
    if (!pdfConfigured()) return new NextResponse("PDF export is not configured on this deployment. Download the HTML file instead; it prints to PDF from any browser.", { status: 503 });
    const pdf = await renderPdf(html);
    if (!pdf) return new NextResponse("The PDF renderer failed. Download the HTML file instead.", { status: 503 });
    return new NextResponse(new Uint8Array(pdf.buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileName(name, "pdf")}"` } });
  }
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="${fileName(name, "html")}"` } });
}
