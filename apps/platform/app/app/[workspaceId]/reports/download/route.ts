import { NextResponse } from "next/server";
import { db } from "@/db";
import { presignGet } from "@/lib/storage";
import { requireWorkspace } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Short-lived signed link to a generated report artifact (membership checked). */
export async function GET(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  await requireWorkspace(workspaceId);
  const runId = new URL(req.url).searchParams.get("run") ?? "";
  const run = await db.query.reportRun.findFirst({ where: (r, { and, eq }) => and(eq(r.id, runId), eq(r.workspaceId, workspaceId)) });
  if (!run?.objectKey) return new NextResponse("Not found", { status: 404 });
  // Prefer the PDF when one was rendered; otherwise the source document (HTML or CSV).
  const pdfKey = (run.snapshot as { pdfKey?: string | null }).pdfKey ?? null;
  const key = pdfKey ?? run.objectKey;
  const ext = pdfKey ? "pdf" : run.format;
  const url = await presignGet(key, 300, `${run.name.replace(/[^\w .-]+/g, " ").trim() || "report"}.${ext}`);
  return NextResponse.redirect(url);
}
