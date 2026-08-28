import type { Metadata } from "next";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { channel } from "@/db/schema/connections";
import { ReportsScreen } from "@/components/reports-screen";
import { listReports } from "@/lib/analytics/reports";
import { hasCapability, requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Reports" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function Page({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ workspaceId }, sp] = await Promise.all([params, searchParams]);
  const { workspace } = await requireWorkspace(workspaceId);
  const [{ definitions, runs }, channels] = await Promise.all([
    listReports(workspaceId, workspace.timezone),
    db.select({ id: channel.id, name: channel.name }).from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded"]))),
  ]);
  const preset = one(sp.range);
  const newInitial = one(sp.new) ? { from: one(sp.from), to: one(sp.to), channelId: one(sp.channel) || undefined, rollingDays: preset === "custom" ? null : preset === "7d" ? 7 : preset === "90d" ? 90 : 28 } : null;
  return <ReportsScreen data={{ workspaceId, definitions, runs, channels, canManage: hasCapability(workspace, "reports.export"), newInitial }} />;
}
