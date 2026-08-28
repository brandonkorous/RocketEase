import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { channel } from "@/db/schema/connections";
import { contact, conversation } from "@/db/schema/engagement";
import { relativeLabel } from "./format";

export type ConversationSummary = {
  unresolved: number;
  unread: number;
  assignedToMe: number;
  recent: { id: string; name: string; preview: string; network: string; lastAt: string; unread: number }[];
};

/** Lightweight counts for Home, the agency overview, and the sidebar badge. */
export async function conversationSummary(workspaceId: string, userId: string, tz: string, limit = 5): Promise<ConversationSummary> {
  const [agg] = await db
    .select({
      unresolved: sql<number>`count(*)::int`,
      unread: sql<number>`count(*) filter (where ${conversation.unreadCount} > 0)::int`,
      mine: sql<number>`count(*) filter (where ${conversation.assigneeUserId} = ${userId})::int`,
    })
    .from(conversation)
    .where(and(eq(conversation.workspaceId, workspaceId), ne(conversation.status, "resolved")));
  const rows = limit
    ? await db
        .select({ id: conversation.id, name: contact.displayName, preview: conversation.preview, network: channel.network, at: conversation.lastMessageAt, unread: conversation.unreadCount })
        .from(conversation)
        .innerJoin(contact, eq(contact.id, conversation.contactId))
        .innerJoin(channel, eq(channel.id, conversation.channelId))
        .where(and(eq(conversation.workspaceId, workspaceId), eq(conversation.status, "open")))
        .orderBy(desc(conversation.lastMessageAt))
        .limit(limit)
    : [];
  return { unresolved: agg.unresolved, unread: agg.unread, assignedToMe: agg.mine, recent: rows.map((r) => ({ id: r.id, name: r.name, preview: r.preview, network: r.network, lastAt: relativeLabel(r.at, tz), unread: r.unread })) };
}
