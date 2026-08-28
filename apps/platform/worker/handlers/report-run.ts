import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportDefinition, reportRun, type ReportFilters } from "@/db/schema/analytics";
import { workspace } from "@/db/schema/app";
import { workspaceMembership } from "@/db/schema/app";
import { buildCsv } from "@/lib/analytics/export";
import { DEFINITIONS_VERSION } from "@/lib/analytics/metrics";
import { nextRunAt } from "@/lib/analytics/reports";
import { emit } from "@/lib/jobs/outbox";
import type { JobPayloads } from "@/lib/jobs/queues";
import { notify } from "@/lib/notifications";
import { workspacePath } from "@/lib/nav";
import { presignGet, putObject } from "@/lib/storage";
import type { HandlerContext } from "./index";

/**
 * Generate one report artifact. Recipients are re-checked at run time
 * (analytics.md "Reports"): only current workspace members receive mail.
 */
export async function reportRunJob(data: JobPayloads["report.run"], ctx: HandlerContext) {
  const run = await db.query.reportRun.findFirst({ where: (r, { eq }) => eq(r.id, data.reportRunId) });
  if (!run || run.status === "done") return;
  const ws = await db.query.workspace.findFirst({ where: eq(workspace.id, run.workspaceId) });
  if (!ws) return;
  const l = ctx.log.child({ reportRunId: run.id });
  await db.update(reportRun).set({ status: "running", startedAt: new Date() }).where(eq(reportRun.id, run.id));
  try {
    const filters = (run.snapshot as { filters?: ReportFilters }).filters;
    if (!filters) throw new Error("Run has no filters snapshot");
    const csv = await buildCsv({ workspaceId: ws.id, workspaceName: ws.name, timezone: ws.timezone, filters, generatedBy: "scheduled report" });
    const key = `${ws.organizationId}/${ws.id}/reports/${run.id}.csv`;
    await putObject(key, Buffer.from(csv, "utf8"), "text/csv");
    const allowed = await allowedRecipients(ws.id, run.recipients);
    await db.update(reportRun).set({ status: "done", objectKey: key, sizeBytes: Buffer.byteLength(csv), finishedAt: new Date(), snapshot: { ...run.snapshot, definitionsVersion: DEFINITIONS_VERSION, deliveredTo: allowed } }).where(eq(reportRun.id, run.id));
    if (run.definitionId) {
      const def = await db.query.reportDefinition.findFirst({ where: eq(reportDefinition.id, run.definitionId) });
      if (def) await db.update(reportDefinition).set({ lastRunAt: new Date(), nextRunAt: nextRunAt(def.cadence, ws.timezone) }).where(eq(reportDefinition.id, def.id));
    }
    const href = workspacePath(ws.id, "reports");
    if (run.requestedByUserId) await notify({ workspaceId: ws.id, organizationId: ws.organizationId, userId: run.requestedByUserId, kind: "report.ready", title: `Report "${run.name}" is ready`, href });
    if (allowed.length) {
      const url = await presignGet(key, 7 * 86_400, `${run.name}.csv`);
      await db.transaction(async (tx) => {
        for (const to of allowed) await emit(tx, "mail.send", { to, template: "notification", data: { name: to, title: `Report "${run.name}" (${filters.from} – ${filters.to})`, body: `Your scheduled Make It Social report is ready. The download link is valid for 7 days.`, url }, organizationId: ws.organizationId }, { organizationId: ws.organizationId, workspaceId: ws.id });
      });
    }
    l.info("report generated", { bytes: Buffer.byteLength(csv), recipients: allowed.length, skipped: run.recipients.length - allowed.length });
  } catch (err) {
    await db.update(reportRun).set({ status: "failed", error: String(err), finishedAt: new Date() }).where(eq(reportRun.id, run.id));
    throw err;
  }
}

async function allowedRecipients(workspaceId: string, recipients: string[]) {
  if (recipients.length === 0) return [];
  const rows = await db.query.workspaceMembership.findMany({ where: eq(workspaceMembership.workspaceId, workspaceId), with: undefined });
  const users = await db.query.user.findMany({ where: (u, { inArray }) => inArray(u.id, rows.map((r) => r.userId)) });
  const emails = new Set(users.map((u) => u.email.toLowerCase()));
  return recipients.filter((r) => emails.has(r.toLowerCase()));
}

/** Scheduler tick: create a run for every due definition. */
export async function enqueueDueReports() {
  const now = new Date();
  const due = await db.query.reportDefinition.findMany({ where: (d, { and, lte, isNotNull, ne }) => and(ne(d.cadence, "none"), isNotNull(d.nextRunAt), lte(d.nextRunAt, now)) });
  for (const def of due) {
    const ws = await db.query.workspace.findFirst({ where: eq(workspace.id, def.workspaceId) });
    if (!ws) continue;
    const { resolveFilters } = await import("@/lib/analytics/reports");
    await db.transaction(async (tx) => {
      await tx.update(reportDefinition).set({ nextRunAt: nextRunAt(def.cadence, ws.timezone) }).where(eq(reportDefinition.id, def.id));
      const [run] = await tx.insert(reportRun).values({ organizationId: def.organizationId, workspaceId: def.workspaceId, definitionId: def.id, name: def.name, snapshot: { filters: resolveFilters(def, ws.timezone) }, recipients: def.recipients }).returning({ id: reportRun.id });
      await emit(tx, "report.run", { reportRunId: run.id }, { organizationId: def.organizationId, workspaceId: def.workspaceId, dedupeKey: `report.run:${run.id}` });
    });
  }
  return due.length;
}
