import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { channel } from "@/db/schema/connections";
import { ReportForm } from "@/components/reports/report-form";
import { getReport } from "@/lib/analytics/reports";
import { workspacePath } from "@/lib/nav";
import { hasCapability, requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Edit report" };

export default async function Page({ params }: { params: Promise<{ workspaceId: string; reportId: string }> }) {
  const { workspaceId, reportId } = await params;
  const { workspace } = await requireWorkspace(workspaceId);
  if (reportId === "download") notFound();
  const def = await getReport(workspaceId, reportId);
  if (!def) notFound();
  const channels = await db.select({ id: channel.id, name: channel.name }).from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded"])));
  const canManage = hasCapability(workspace, "reports.export");
  return (
    <div className="mx-auto flex w-full max-w-200 flex-col gap-4 px-4 py-5 lg:px-8">
      <div><Link href={workspacePath(workspaceId, "reports")} className="text-sm text-secondary hover:underline">← Reports</Link><h1 className="app-title mt-1">{def.name}</h1></div>
      {canManage ? (
        <section className="rounded-box border border-base-300 p-4"><ReportForm workspaceId={workspaceId} channels={channels} initial={{ id: def.id, name: def.name, from: def.filters.from, to: def.filters.to, rollingDays: def.rollingDays, channelId: def.filters.channelId, compare: def.filters.compare, scope: def.filters.scope, cadence: def.cadence, recipients: def.recipients }} /></section>
      ) : (
        <p className="text-sm text-secondary">Your role can view reports but not change them.</p>
      )}
    </div>
  );
}
