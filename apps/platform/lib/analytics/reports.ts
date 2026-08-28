import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reportDefinition, reportRun, type ReportCadence, type ReportDefinition, type ReportFilters, type ReportFormat } from "@/db/schema/analytics";
import { user } from "@/db/schema/auth";
import { formatInZone } from "@/lib/time";
import { shiftDay } from "./periods";
import { dayKey } from "@/lib/time";

/** Next delivery in the workspace timezone: 08:00 local on the next day/Monday/1st. */
export function nextRunAt(cadence: ReportCadence, tz: string, from = new Date()): Date | null {
  if (cadence === "none") return null;
  const local = new Date(from.toLocaleString("en-US", { timeZone: tz }));
  const next = new Date(local);
  next.setHours(8, 0, 0, 0);
  if (next <= local) next.setDate(next.getDate() + 1);
  if (cadence === "weekly") while (next.getDay() !== 1) next.setDate(next.getDate() + 1);
  if (cadence === "monthly") { next.setDate(1); if (next <= local) next.setMonth(next.getMonth() + 1); }
  const offset = local.getTime() - from.getTime();
  return new Date(next.getTime() - offset);
}

/** Resolve a definition's filters to absolute dates for a run (rolling windows end yesterday). */
export function resolveFilters(def: Pick<ReportDefinition, "filters" | "rollingDays">, tz: string): ReportFilters {
  if (!def.rollingDays) return def.filters;
  const to = shiftDay(dayKey(new Date(), tz), -1);
  return { ...def.filters, to, from: shiftDay(to, -(def.rollingDays - 1)) };
}

export type ReportListRow = { id: string; name: string; cadence: ReportCadence; recipients: number; window: string; lastRun: string | null; nextRun: string | null; createdBy: string | null; format: ReportFormat; clientFacing: boolean };
export type RunRow = { id: string; name: string; status: string; format: string; generatedAt: string; by: string | null; sizeBytes: number | null; error: string | null; objectKey: string | null; definitionId: string | null };

export async function listReports(workspaceId: string, tz: string): Promise<{ definitions: ReportListRow[]; runs: RunRow[] }> {
  const [defs, runs] = await Promise.all([
    db.select({ d: reportDefinition, by: user.name }).from(reportDefinition).leftJoin(user, eq(user.id, reportDefinition.createdByUserId)).where(eq(reportDefinition.workspaceId, workspaceId)).orderBy(reportDefinition.name),
    db.select({ r: reportRun, by: user.name }).from(reportRun).leftJoin(user, eq(user.id, reportRun.requestedByUserId)).where(eq(reportRun.workspaceId, workspaceId)).orderBy(desc(reportRun.createdAt)).limit(30),
  ]);
  return {
    definitions: defs.map(({ d, by }) => ({ id: d.id, name: d.name, cadence: d.cadence, recipients: d.recipients.length, window: d.rollingDays ? `Last ${d.rollingDays} days` : `${d.filters.from} → ${d.filters.to}`, lastRun: d.lastRunAt ? formatInZone(d.lastRunAt, tz) : null, nextRun: d.nextRunAt ? formatInZone(d.nextRunAt, tz) : null, createdBy: by, format: d.format, clientFacing: d.clientFacing })),
    runs: runs.map(({ r, by }) => ({ id: r.id, name: r.name, status: r.status, format: r.format.toUpperCase(), generatedAt: formatInZone(r.finishedAt ?? r.createdAt, tz), by, sizeBytes: r.sizeBytes, error: r.error, objectKey: r.objectKey, definitionId: r.definitionId })),
  };
}

export async function getReport(workspaceId: string, id: string) {
  return db.query.reportDefinition.findFirst({ where: and(eq(reportDefinition.workspaceId, workspaceId), eq(reportDefinition.id, id)) });
}

/** Definitions whose schedule is due. */
export async function dueReports(now = new Date()) {
  return db.query.reportDefinition.findMany({ where: (d, { and, lte, isNotNull, ne }) => and(ne(d.cadence, "none"), isNotNull(d.nextRunAt), lte(d.nextRunAt, now)) });
}
