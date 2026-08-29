import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversation } from "@/db/schema/engagement";
import type { InboxScreenData } from "@/components/inbox/types";
import { hasCapability, requireWorkspace } from "@/lib/session";
import { providers } from "@/lib/providers";
import { conversationDetail } from "./detail";
import { inboxAgents, inboxChannels, inboxStats, listConversations, type InboxFilters, type InboxTab } from "./queries";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseFilters(sp: Search): InboxFilters {
  const tab = one(sp.tab) as InboxTab;
  const status = one(sp.status);
  const sort = one(sp.sort);
  return {
    tab: ["all", "unread", "mentions", "dms", "comments", "reviews"].includes(tab) ? tab : "all",
    status: ["open", "snoozed", "resolved", "all"].includes(status) ? (status as InboxFilters["status"]) : "open",
    channel: one(sp.channel),
    assignee: one(sp.assignee),
    sort: ["newest", "oldest", "due"].includes(sort) ? (sort as InboxFilters["sort"]) : "newest",
    q: one(sp.q).slice(0, 80),
  };
}

/** Everything the inbox screen needs; opening a thread also clears its unread count. */
export async function loadInboxData(workspaceId: string, sp: Search, conversationId?: string): Promise<InboxScreenData> {
  const { session, workspace } = await requireWorkspace(workspaceId);
  const filters = parseFilters(sp);
  const [{ rows, counts }, stats, agents, channels, detail] = await Promise.all([
    listConversations(workspaceId, session.user.id, filters, workspace.timezone),
    inboxStats(workspaceId, session.user.id),
    inboxAgents(workspaceId),
    inboxChannels(workspaceId),
    conversationId ? conversationDetail(workspaceId, conversationId, workspace.timezone) : Promise.resolve(null),
  ]);
  if (detail) await db.update(conversation).set({ unreadCount: 0 }).where(and(eq(conversation.id, detail.id), eq(conversation.workspaceId, workspaceId)));
  // The demo tools exist exactly when the DEMO NETWORK does — not when NODE_ENV
  // happens to say "development". Gating on NODE_ENV hid them from every production
  // build, including the one CI runs, so this panel and the inbox e2e that drives it
  // could only ever work under next dev. PROVIDERS_ENABLE_MOCK is unset in
  // production, so the panel stays hidden there exactly as it did before.
  const demoAvailable = providers().has("mock");
  return {
    workspaceId,
    userId: session.user.id,
    timezone: workspace.timezone,
    filters,
    counts,
    rows: detail ? rows.map((r) => (r.id === detail.id ? { ...r, unread: 0 } : r)) : rows,
    stats,
    agents,
    channels,
    detail,
    canHandle: hasCapability(workspace, "conversations.handle"),
    devChannels: demoAvailable ? channels.filter((c) => c.provider === "mock") : [],
  };
}
