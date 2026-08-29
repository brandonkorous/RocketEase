import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { agencyPeriod, canSeeEconomics, marginReport } from "@/lib/agency/margin-queries";
import { buildMarginCsv } from "@/lib/agency/margin-csv";
import { listUserWorkspaces, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** CSV of the Economics table: one row per client, with every definition stamped in the header. */
export async function GET(req: Request) {
  const session = await requireUser();
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("org") ?? "";
  const clients = (await listUserWorkspaces(session.user.id)).filter((w) => w.organizationId === organizationId);
  if (!clients.length) return new NextResponse("No client workspaces in that organization.", { status: 404 });
  if (!(await canSeeEconomics(organizationId, session.user.id))) {
    await audit({ action: "authz.deny:agency.economics_export", actorUserId: session.user.id, organizationId, result: "denied" });
    return new NextResponse("Only organization owners and admins can export client economics.", { status: 403 });
  }

  const timezone = clients[0].timezone;
  const period = agencyPeriod(url.searchParams.get("period") ?? undefined, timezone);
  const report = await marginReport({ organizationId, clients: clients.map((c) => ({ id: c.id, name: c.name })), period, timezone });
  const csv = buildMarginCsv(report, { organizationName: clients[0].organizationName, generatedBy: session.user.email, timezone });

  await audit({ action: "agency.economics_export", actorUserId: session.user.id, organizationId, targetType: "organization", targetId: organizationId, summary: { after: { period: period.month, clients: report.rows.length } } });
  const name = `client-economics_${period.month}.csv`;
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
}
