/*
 * Persistence for data-quality findings: upsert what a run observed, resolve
 * what it no longer sees, and expose open issues to the analytics screen.
 */
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { dataQualityIssue, type DataQualityIssue } from "@/db/schema/quality";
import { workspace } from "@/db/schema/app";
import { log } from "@/lib/log";
import { collectFindings, type Finding } from "./quality";

export type QualityIssueRow = Pick<DataQualityIssue, "kind" | "severity" | "message" | "lastSeenAt">;
export type QualitySummary = { open: number; issues: QualityIssueRow[]; revisedFacts: number };

export async function saveFindings(organizationId: string, workspaceId: string, findings: Finding[]) {
  const now = new Date();
  for (const f of findings) {
    await db
      .insert(dataQualityIssue)
      .values({ organizationId, workspaceId, kind: f.kind, subject: f.subject, severity: f.severity, message: f.message, details: f.details ?? {}, firstSeenAt: now, lastSeenAt: now, resolvedAt: null })
      .onConflictDoUpdate({
        target: [dataQualityIssue.workspaceId, dataQualityIssue.kind, dataQualityIssue.subject],
        set: { severity: f.severity, message: f.message, details: f.details ?? {}, lastSeenAt: now, resolvedAt: null },
      });
  }
  const seen = findings.map((f) => `${f.kind}:${f.subject}`);
  const stillSeen = seen.length ? notInArray(sql`${dataQualityIssue.kind} || ':' || ${dataQualityIssue.subject}`, seen) : sql`true`;
  await db.update(dataQualityIssue).set({ resolvedAt: now }).where(and(eq(dataQualityIssue.workspaceId, workspaceId), isNull(dataQualityIssue.resolvedAt), stillSeen));
}

/** Run every check for one workspace and persist the outcome. Returns the finding count. */
export async function runQualityChecks(organizationId: string, workspaceId: string): Promise<number> {
  const findings = await collectFindings(workspaceId);
  await saveFindings(organizationId, workspaceId, findings);
  return findings.length;
}

/** Workspaces that have at least one channel: the only ones with facts to check. */
export async function workspacesWithChannels(): Promise<{ id: string; organizationId: string }[]> {
  return db
    .select({ id: workspace.id, organizationId: workspace.organizationId })
    .from(workspace)
    .where(sql`exists (select 1 from channel c where c.workspace_id = ${workspace.id})`);
}

/** Open issues for the analytics header. Safe before the migration exists (returns empty). */
export async function openQuality(workspaceId: string): Promise<QualitySummary> {
  try {
    const issues = await db
      .select({ kind: dataQualityIssue.kind, severity: dataQualityIssue.severity, message: dataQualityIssue.message, lastSeenAt: dataQualityIssue.lastSeenAt })
      .from(dataQualityIssue)
      .where(and(eq(dataQualityIssue.workspaceId, workspaceId), isNull(dataQualityIssue.resolvedAt)))
      .orderBy(dataQualityIssue.severity, dataQualityIssue.lastSeenAt);
    return { open: issues.length, issues, revisedFacts: issues.filter((i) => i.kind === "revised").length };
  } catch (err) {
    log.warn("quality summary unavailable", { workspaceId, err });
    return { open: 0, issues: [], revisedFacts: 0 };
  }
}
