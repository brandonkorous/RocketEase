import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportDefinition, reportRun, type ReportFilters, type ReportFormat } from "@/db/schema/analytics";
import { workspace } from "@/db/schema/app";
import { DEFINITIONS_VERSION } from "@/lib/analytics/metrics";
import { nextRunAt, resolveFilters } from "@/lib/analytics/reports";
import { periodLabel } from "@/lib/analytics/periods";
import { emit } from "@/lib/jobs/outbox";
import type { JobPayloads } from "@/lib/jobs/queues";
import { notify } from "@/lib/notifications";
import { workspacePath } from "@/lib/nav";
import { buildAndStoreArtifact } from "@/lib/reports/artifact";
import { deliverReport } from "@/lib/reports/deliver";
import { resolveRecipients } from "@/lib/reports/recipients";
import type { HandlerContext } from "./index";

type Snapshot = { filters?: ReportFilters; format?: ReportFormat; clientFacing?: boolean; externalRecipients?: string[] };

/**
 * Generate one report artifact. Recipients are re-checked at run time
 * (analytics.md "Reports"): only current workspace members, and external
 * addresses that completed the double opt-in, receive mail.
 */
export async function reportRunJob(data: JobPayloads["report.run"], ctx: HandlerContext) {
  const run = await db.query.reportRun.findFirst({ where: (r, { eq }) => eq(r.id, data.reportRunId) });
  if (!run || run.status === "done") return;
  const ws = await db.query.workspace.findFirst({ where: eq(workspace.id, run.workspaceId) });
  if (!ws) return;
  const l = ctx.log.child({ reportRunId: run.id });
  await db.update(reportRun).set({ status: "running", startedAt: new Date() }).where(eq(reportRun.id, run.id));
  try {
    const snapshot = run.snapshot as Snapshot;
    const filters = snapshot.filters;
    if (!filters) throw new Error("Run has no filters snapshot");
    const format: ReportFormat = snapshot.format === "html" ? "html" : "csv";
    const artifact = await buildAndStoreArtifact({ runId: run.id, name: run.name, workspace: ws, filters, format, generatedBy: "scheduled report" });
    const recipients = await resolveRecipients({ workspaceId: ws.id, members: run.recipients, external: snapshot.externalRecipients ?? [], clientFacing: Boolean(snapshot.clientFacing) });
    const delivery = await deliverReport({
      run: { id: run.id, name: run.name, organizationId: ws.organizationId, workspaceId: ws.id },
      workspace: ws,
      period: periodLabel(filters),
      objectKey: artifact.key,
      extension: artifact.extension,
      clientFacing: Boolean(snapshot.clientFacing),
      recipients,
    });
    await db
      .update(reportRun)
      .set({
        status: "done",
        objectKey: artifact.key,
        format: artifact.format,
        sizeBytes: artifact.bytes,
        finishedAt: new Date(),
        snapshot: { ...snapshot, definitionsVersion: DEFINITIONS_VERSION, pdfKey: artifact.pdfKey, deliveredTo: delivery.delivered, skippedRecipients: recipients.skipped },
      })
      .where(eq(reportRun.id, run.id));
    await touchDefinition(run.definitionId, ws.timezone);
    if (run.requestedByUserId) await notify({ workspaceId: ws.id, organizationId: ws.organizationId, userId: run.requestedByUserId, kind: "report.ready", title: `Report "${run.name}" is ready`, href: workspacePath(ws.id, "reports") });
    l.info("report generated", { format, bytes: artifact.bytes, pdf: Boolean(artifact.pdfKey), recipients: delivery.delivered.length, skipped: recipients.skipped.length });
  } catch (err) {
    await db.update(reportRun).set({ status: "failed", error: String(err), finishedAt: new Date() }).where(eq(reportRun.id, run.id));
    throw err;
  }
}

async function touchDefinition(definitionId: string | null, tz: string) {
  if (!definitionId) return;
  const def = await db.query.reportDefinition.findFirst({ where: eq(reportDefinition.id, definitionId) });
  if (def) await db.update(reportDefinition).set({ lastRunAt: new Date(), nextRunAt: nextRunAt(def.cadence, tz) }).where(eq(reportDefinition.id, def.id));
}

/** Scheduler tick: create a run for every due definition. */
export async function enqueueDueReports() {
  const now = new Date();
  const due = await db.query.reportDefinition.findMany({ where: (d, { and, lte, isNotNull, ne }) => and(ne(d.cadence, "none"), isNotNull(d.nextRunAt), lte(d.nextRunAt, now)) });
  for (const def of due) {
    const ws = await db.query.workspace.findFirst({ where: eq(workspace.id, def.workspaceId) });
    if (!ws) continue;
    await db.transaction(async (tx) => {
      await tx.update(reportDefinition).set({ nextRunAt: nextRunAt(def.cadence, ws.timezone) }).where(eq(reportDefinition.id, def.id));
      const snapshot: Snapshot = { filters: resolveFilters(def, ws.timezone), format: def.format, clientFacing: def.clientFacing, externalRecipients: def.externalRecipients };
      const [run] = await tx
        .insert(reportRun)
        .values({ organizationId: def.organizationId, workspaceId: def.workspaceId, definitionId: def.id, name: def.name, format: def.format, snapshot, recipients: def.recipients })
        .returning({ id: reportRun.id });
      await emit(tx, "report.run", { reportRunId: run.id }, { organizationId: def.organizationId, workspaceId: def.workspaceId, dedupeKey: `report.run:${run.id}` });
    });
  }
  return due.length;
}
