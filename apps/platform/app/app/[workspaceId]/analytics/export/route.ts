import { NextResponse } from "next/server";
import { buildCsv } from "@/lib/analytics/export";
import { parseAnalyticsFilters } from "@/lib/analytics/periods";
import { audit } from "@/lib/audit";
import { track } from "@/lib/telemetry";
import { AuthorizationError } from "@/lib/authz";
import { requireCapability } from "@/lib/session";

export const dynamic = "force-dynamic";

/** CSV download of the current analytics view (ANA-003 P0). */
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
  const filters = parseAnalyticsFilters(sp, ctx.workspace.timezone);
  const csv = await buildCsv({ workspaceId, workspaceName: ctx.workspace.name, timezone: ctx.workspace.timezone, filters, generatedBy: ctx.session.user.email });
  await audit({ action: "report.export", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "analytics", summary: { after: filters } });
  await track("report_exported", { userId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, surface: "route:analytics/export", props: { format: "csv", scope: filters.scope } });
  const name = `analytics_${ctx.workspace.slug ?? "workspace"}_${filters.from}_${filters.to}.csv`;
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
}
