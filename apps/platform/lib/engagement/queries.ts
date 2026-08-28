import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { workspaceMembership } from "@/db/schema/app";
import { channel } from "@/db/schema/connections";
import { contact, contactIdentity, conversation, message } from "@/db/schema/engagement";
import { relativeLabel } from "./format";

export type InboxTab = "all" | "unread" | "mentions" | "dms" | "comments";
export type InboxFilters = { tab: InboxTab; status: "open" | "snoozed" | "resolved" | "all"; channel: string; assignee: string; sort: "newest" | "oldest" | "due"; q: string };

export type ConversationRow = {
  id: string; kind: string; status: string; priority: string; preview: string; unread: number; lastAt: string; overdue: boolean;
  contact: { id: string; name: string; avatarUrl: string | null; handle: string | null };
  channel: { id: string; name: string; network: string };
  assignee: { id: string; name: string } | null;
};

const TAB_WHERE: Record<InboxTab, SQL | undefined> = {
  all: undefined,
  unread: sql`${conversation.unreadCount} > 0`,
  mentions: eq(conversation.kind, "mention"),
  dms: eq(conversation.kind, "message"),
  comments: or(eq(conversation.kind, "comment"), eq(conversation.kind, "review")),
};

function filterWhere(workspaceId: string, userId: string, f: InboxFilters, tab: InboxTab) {
  const parts: (SQL | undefined)[] = [eq(conversation.workspaceId, workspaceId), TAB_WHERE[tab]];
  if (f.status !== "all") parts.push(eq(conversation.status, f.status));
  if (f.channel) parts.push(eq(conversation.channelId, f.channel));
  if (f.assignee === "me") parts.push(eq(conversation.assigneeUserId, userId));
  else if (f.assignee === "unassigned") parts.push(isNull(conversation.assigneeUserId));
  else if (f.assignee) parts.push(eq(conversation.assigneeUserId, f.assignee));
  if (f.q) parts.push(or(sql`${conversation.preview} ilike ${"%" + f.q + "%"}`, sql`${contact.displayName} ilike ${"%" + f.q + "%"}`));
  return and(...parts.filter((p): p is SQL => Boolean(p)));
}

export async function listConversations(workspaceId: string, userId: string, f: InboxFilters, tz: string, limit = 50) {
  const order = f.sort === "oldest" ? asc(conversation.lastMessageAt) : f.sort === "due" ? sql`${conversation.responseDueAt} asc nulls last` : desc(conversation.lastMessageAt);
  const rows = await db
    .select({ c: conversation, contact: { id: contact.id, name: contact.displayName, avatarUrl: contact.avatarUrl }, ch: { id: channel.id, name: channel.name, network: channel.network }, assignee: { id: user.id, name: user.name } })
    .from(conversation)
    .innerJoin(contact, eq(contact.id, conversation.contactId))
    .innerJoin(channel, eq(channel.id, conversation.channelId))
    .leftJoin(user, eq(user.id, conversation.assigneeUserId))
    .where(filterWhere(workspaceId, userId, f, f.tab))
    .orderBy(order)
    .limit(limit);
  const handles = rows.length ? await db.select({ contactId: contactIdentity.contactId, handle: contactIdentity.handle }).from(contactIdentity).where(inArray(contactIdentity.contactId, rows.map((r) => r.contact.id))) : [];
  const handleOf = new Map(handles.map((h) => [h.contactId, h.handle]));
  const now = Date.now();
  const list: ConversationRow[] = rows.map((r) => ({
    id: r.c.id, kind: r.c.kind, status: r.c.status, priority: r.c.priority, preview: r.c.preview, unread: r.c.unreadCount, lastAt: relativeLabel(r.c.lastMessageAt, tz, now),
    overdue: r.c.status === "open" && !r.c.firstResponseAt && !!r.c.responseDueAt && r.c.responseDueAt.getTime() < now,
    contact: { ...r.contact, handle: handleOf.get(r.contact.id) ?? null }, channel: r.ch, assignee: r.assignee?.id ? r.assignee : null,
  }));
  const counts: Record<InboxTab, number> = { all: 0, unread: 0, mentions: 0, dms: 0, comments: 0 };
  for (const tab of Object.keys(counts) as InboxTab[]) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(conversation).innerJoin(contact, eq(contact.id, conversation.contactId)).where(filterWhere(workspaceId, userId, f, tab));
    counts[tab] = n;
  }
  return { rows: list, counts };
}

export type InboxStats = { unresolved: number; overdue: number; assignedToMe: number; resolvedThisWeek: number; avgFirstResponseMinutes: number | null; inboundByDay: number[] };

export async function inboxStats(workspaceId: string, userId: string): Promise<InboxStats> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const wk = weekAgo.toISOString();
  const [agg] = await db
    .select({
      unresolved: sql<number>`count(*) filter (where ${conversation.status} <> 'resolved')::int`,
      overdue: sql<number>`count(*) filter (where ${conversation.status} = 'open' and ${conversation.firstResponseAt} is null and ${conversation.responseDueAt} < now())::int`,
      mine: sql<number>`count(*) filter (where ${conversation.status} <> 'resolved' and ${conversation.assigneeUserId} = ${userId})::int`,
      resolved: sql<number>`count(*) filter (where ${conversation.resolvedAt} >= ${wk}::timestamptz)::int`,
      avg: sql<number | null>`avg(extract(epoch from (${conversation.firstResponseAt} - ${conversation.createdAt})) / 60) filter (where ${conversation.firstResponseAt} >= ${wk}::timestamptz)`,
    })
    .from(conversation)
    .where(eq(conversation.workspaceId, workspaceId));
  const days = await db
    .select({ d: sql<string>`to_char(${message.occurredAt}, 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
    .from(message)
    .where(and(eq(message.workspaceId, workspaceId), eq(message.direction, "inbound"), gte(message.occurredAt, weekAgo), lt(message.occurredAt, new Date())))
    .groupBy(sql`1`);
  const byDay = new Map(days.map((d) => [d.d, d.n]));
  const inboundByDay = Array.from({ length: 7 }, (_, i) => byDay.get(new Date(Date.now() - (6 - i) * 86_400_000).toISOString().slice(0, 10)) ?? 0);
  return { unresolved: agg.unresolved, overdue: agg.overdue, assignedToMe: agg.mine, resolvedThisWeek: agg.resolved, avgFirstResponseMinutes: agg.avg === null ? null : Math.round(Number(agg.avg)), inboundByDay };
}

/** Members who can handle conversations (assignees). */
export async function inboxAgents(workspaceId: string) {
  const rows = await db.select({ userId: user.id, name: user.name, image: user.image, role: workspaceMembership.role }).from(workspaceMembership).innerJoin(user, eq(user.id, workspaceMembership.userId)).where(and(eq(workspaceMembership.workspaceId, workspaceId), inArray(workspaceMembership.role, ["owner", "admin", "manager", "responder", "creator"])));
  return rows.map((r) => ({ userId: r.userId, name: r.name, image: r.image ?? null, role: r.role }));
}

export async function inboxChannels(workspaceId: string) {
  return db.select({ id: channel.id, name: channel.name, network: channel.network, provider: channel.provider, remoteId: channel.remoteId }).from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded"])));
}
