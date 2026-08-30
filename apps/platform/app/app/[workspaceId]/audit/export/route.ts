import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { buildAuditCsv } from "@/lib/audit/csv";
import { auditRowsForExport, parseAuditFilters } from "@/lib/audit/queries";
import { AuthorizationError } from "@/lib/authz";
import { requireCapability } from "@/lib/session";

export const dynamic = "force-dynamic";

/** CSV of the audit log, filtered exactly as the screen is (AA-04). */
export async function GET(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  let ctx;
  try {
    ctx = await requireCapability(workspaceId, "reports.export");
  } catch (e) {
    if (e instanceof AuthorizationError) return new NextResponse("You don't have permission to export.", { status: 403 });
    throw e;
  }
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseAuditFilters(sp);
  const rows = await auditRowsForExport(workspaceId, filters);
  const csv = buildAuditCsv(rows, { workspaceName: ctx.workspace.name, generatedBy: ctx.session.user.email, generatedAt: new Date() });

  // Reading the audit log is itself an audited action.
  await audit({ action: "audit.export", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "audit_event", summary: { after: { rows: rows.length, ...filters } } });

  const name = `audit_${ctx.workspace.slug ?? "workspace"}_${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
}
