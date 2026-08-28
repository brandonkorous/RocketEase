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
  const url = await presignGet(run.objectKey, 300, `${run.name}.csv`);
  return NextResponse.redirect(url);
}
