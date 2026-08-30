import "server-only";
import { and, desc, eq, gte, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditEvent } from "@/db/schema/app";
import { user } from "@/db/schema/auth";

export const PAGE_SIZE = 50;

export type AuditFilters = { action: string; actor: string; from: string; to: string };
export type AuditRow = {
  id: string;
  createdAt: Date;
  action: string;
  actorUserId: string | null;
  actorName: string;
  targetType: string | null;
  targetId: string | null;
  result: string;
  note: string | null;
};
export type AuditLogData = {
  workspaceId: string;
  rows: AuditRow[];
  filters: AuditFilters;
  actions: string[];
  actors: { id: string; name: string }[];
  /** Cursor for the next page — the createdAt/id of the last row shown. */
  nextCursor: string | null;
  total: number;
  canExport: boolean;
};

export const EMPTY_AUDIT: AuditLogData = { workspaceId: "", rows: [], filters: { action: "", actor: "", from: "", to: "" }, actions: [], actors: [], nextCursor: null, total: 0, canExport: false };

/** A one-line description of what changed, without dumping the whole payload. */
function noteOf(summary: { before?: unknown; after?: unknown; note?: string } | null): string | null {
  if (!summary) return null;
  if (summary.note) return summary.note;
  const after = summary.after;
  if (after && typeof after === "object") {
    const parts = Object.entries(after as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${String(v)}`);
    if (parts.length) return parts.join(", ");
  }
  return null;
}

/** `createdAt.toISOString()|id`, so paging is stable when two rows share a timestamp. */
const encodeCursor = (r: { createdAt: Date; id: string }) => `${r.createdAt.toISOString()}|${r.id}`;
function decodeCursor(c: string | undefined): { at: Date; id: string } | null {
  if (!c) return null;
  const [at, id] = c.split("|");
  const d = at ? new Date(at) : null;
  return d && !Number.isNaN(d.getTime()) && id ? { at: d, id } : null;
}

export function parseAuditFilters(sp: Record<string, string | undefined>): AuditFilters {
  return { action: sp.action ?? "", actor: sp.actor ?? "", from: sp.from ?? "", to: sp.to ?? "" };
}

function where(workspaceId: string, f: AuditFilters, cursor: string | undefined): SQL {
  const parts: (SQL | undefined)[] = [eq(auditEvent.workspaceId, workspaceId)];
  if (f.action) parts.push(eq(auditEvent.action, f.action));
  if (f.actor) parts.push(eq(auditEvent.actorUserId, f.actor));
  if (f.from) parts.push(gte(auditEvent.createdAt, new Date(`${f.from}T00:00:00.000Z`)));
  if (f.to) parts.push(lte(auditEvent.createdAt, new Date(`${f.to}T23:59:59.999Z`)));
  const c = decodeCursor(cursor);
  // Keyset paging: strictly older than the last row shown.
  if (c) parts.push(or(lt(auditEvent.createdAt, c.at), and(eq(auditEvent.createdAt, c.at), lt(auditEvent.id, c.id))));
  return and(...parts)!;
}

/** Rows for the audit table, plus the values its filters offer. */
export async function auditLogData(workspaceId: string, f: AuditFilters, cursor: string | undefined, canExport: boolean): Promise<AuditLogData> {
  const [rows, actions, actors, counted] = await Promise.all([
    db
      .select({ e: auditEvent, actorName: user.name, actorEmail: user.email })
      .from(auditEvent)
      .leftJoin(user, eq(user.id, auditEvent.actorUserId))
      .where(where(workspaceId, f, cursor))
      .orderBy(desc(auditEvent.createdAt), desc(auditEvent.id))
      .limit(PAGE_SIZE + 1),
    db.selectDistinct({ action: auditEvent.action }).from(auditEvent).where(eq(auditEvent.workspaceId, workspaceId)).orderBy(auditEvent.action),
    db
      .selectDistinct({ id: user.id, name: user.name })
      .from(auditEvent)
      .innerJoin(user, eq(user.id, auditEvent.actorUserId))
      .where(eq(auditEvent.workspaceId, workspaceId))
      .orderBy(user.name),
    db.select({ n: sql<number>`count(*)::int` }).from(auditEvent).where(where(workspaceId, f, undefined)),
  ]);

  const page = rows.slice(0, PAGE_SIZE);
  return {
    workspaceId,
    filters: f,
    actions: actions.map((a) => a.action),
    actors,
    total: counted[0]?.n ?? 0,
    canExport,
    nextCursor: rows.length > PAGE_SIZE && page.length ? encodeCursor(page[page.length - 1]!.e) : null,
    rows: page.map(({ e, actorName, actorEmail }) => ({
      id: e.id,
      createdAt: e.createdAt,
      action: e.action,
      actorUserId: e.actorUserId,
      actorName: actorName ?? actorEmail ?? (e.actorUserId ? "Removed user" : "System"),
      targetType: e.targetType,
      targetId: e.targetId,
      result: e.result,
      note: noteOf(e.summary),
    })),
  };
}

/** Every matching row, for the CSV. Capped so one export cannot pull the table. */
export async function auditRowsForExport(workspaceId: string, f: AuditFilters, limit = 10_000): Promise<AuditRow[]> {
  const page = await auditLogData(workspaceId, f, undefined, true);
  if (page.total <= PAGE_SIZE) return page.rows;
  const rows = await db
    .select({ e: auditEvent, actorName: user.name, actorEmail: user.email })
    .from(auditEvent)
    .leftJoin(user, eq(user.id, auditEvent.actorUserId))
    .where(where(workspaceId, f, undefined))
    .orderBy(desc(auditEvent.createdAt), desc(auditEvent.id))
    .limit(limit);
  return rows.map(({ e, actorName, actorEmail }) => ({
    id: e.id,
    createdAt: e.createdAt,
    action: e.action,
    actorUserId: e.actorUserId,
    actorName: actorName ?? actorEmail ?? (e.actorUserId ? "Removed user" : "System"),
    targetType: e.targetType,
    targetId: e.targetId,
    result: e.result,
    note: noteOf(e.summary),
  }));
}
