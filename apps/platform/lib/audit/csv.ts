/*
 * Audit CSV. Pure so it can be tested without a database, and so the escaping
 * rule lives in one place — an audit export that mangles a comma is worthless.
 */
import type { AuditRow } from "./queries";

const HEADERS = ["timestamp_utc", "action", "actor", "actor_user_id", "target_type", "target_id", "result", "detail"] as const;

/** RFC 4180: quote everything that could break a cell, and double any quotes inside. */
export function csvCell(v: string | null | undefined): string {
  const s = v ?? "";
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildAuditCsv(rows: AuditRow[], meta: { workspaceName: string; generatedBy: string; generatedAt: Date }): string {
  const lines = [
    `# RocketEase audit log,${csvCell(meta.workspaceName)}`,
    `# generated,${meta.generatedAt.toISOString()},by,${csvCell(meta.generatedBy)}`,
    `# rows,${rows.length}`,
    HEADERS.join(","),
  ];
  for (const r of rows) {
    lines.push([r.createdAt.toISOString(), r.action, r.actorName, r.actorUserId ?? "", r.targetType ?? "", r.targetId ?? "", r.result, r.note ?? ""].map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}
