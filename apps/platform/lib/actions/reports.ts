"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reportDefinition, reportRun, type ReportCadence } from "@/db/schema/analytics";
import { nextRunAt, resolveFilters } from "@/lib/analytics/reports";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/jobs/outbox";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "./content/shared";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  from: z.string(),
  to: z.string(),
  rollingDays: z.number().int().min(1).max(365).nullable(),
  channelId: z.string().optional(),
  compare: z.enum(["previous", "year", "none"]).default("previous"),
  scope: z.enum(["all", "organic", "paid"]).default("all"),
  cadence: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
  recipients: z.array(z.string().email()).max(20).default([]),
});
export type ReportInput = z.infer<typeof schema>;

export async function saveReport(workspaceId: string, input: ReportInput): Promise<ActionState & { id?: string }> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "reports.export");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail("Check the report name, dates, and recipient emails.");
    const v = parsed.data;
    const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
    if (v.rollingDays) { const r = resolveFilters({ filters: { from: "", to: "", compare: v.compare, scope: v.scope }, rollingDays: v.rollingDays }, ctx.workspace.timezone); v.from = r.from; v.to = r.to; }
    else if (!isDay(v.from) || !isDay(v.to) || v.from > v.to) return fail("Choose a valid start and end date.");
    if (v.cadence !== "none" && v.recipients.length === 0) return fail("Scheduled reports need at least one recipient.");
    const filters = { from: v.from, to: v.to, compare: v.compare, scope: v.scope, channelId: v.channelId || undefined };
    const values = { name: v.name, filters, rollingDays: v.rollingDays, cadence: v.cadence as ReportCadence, recipients: v.recipients, nextRunAt: nextRunAt(v.cadence as ReportCadence, ctx.workspace.timezone), updatedAt: new Date() };
    let id = v.id;
    if (id) {
      const [row] = await db.update(reportDefinition).set(values).where(and(eq(reportDefinition.id, id), eq(reportDefinition.workspaceId, workspaceId))).returning({ id: reportDefinition.id });
      if (!row) return fail("Report not found.");
    } else {
      const [row] = await db.insert(reportDefinition).values({ ...values, organizationId: ctx.workspace.organizationId, workspaceId, createdByUserId: ctx.session.user.id }).returning({ id: reportDefinition.id });
      id = row.id;
    }
    await audit({ action: "report.save", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "report_definition", targetId: id, summary: { after: values } });
    return { ok: "Report saved.", id };
  });
}

export async function deleteReport(workspaceId: string, id: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "reports.export");
    await db.delete(reportDefinition).where(and(eq(reportDefinition.id, id), eq(reportDefinition.workspaceId, workspaceId)));
    await audit({ action: "report.delete", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "report_definition", targetId: id });
    return { ok: "Report deleted." };
  });
}

/** Generate the report now (CSV in storage + email to recipients when any). */
export async function runReportNow(workspaceId: string, id: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "reports.export");
    const def = await db.query.reportDefinition.findFirst({ where: (d, { and, eq }) => and(eq(d.id, id), eq(d.workspaceId, workspaceId)) });
    if (!def) return fail("Report not found.");
    await db.transaction(async (tx) => {
      const [run] = await tx.insert(reportRun).values({ organizationId: def.organizationId, workspaceId, definitionId: def.id, name: def.name, snapshot: { filters: resolveFilters(def, ctx.workspace.timezone) }, recipients: def.recipients, requestedByUserId: ctx.session.user.id }).returning({ id: reportRun.id });
      await emit(tx, "report.run", { reportRunId: run.id }, { organizationId: def.organizationId, workspaceId, dedupeKey: `report.run:${run.id}` });
    });
    return { ok: "Generating — it appears in Report history in a moment." };
  });
}
