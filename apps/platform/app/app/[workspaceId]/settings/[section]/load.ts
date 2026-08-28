import "server-only";
import { headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import type { SessionRow } from "@/components/security-panel";
import type { PolicyView } from "@/components/approval-policies";
import type { SavedReplyRow } from "@/components/settings/saved-replies";
import { db } from "@/db";
import { workspace, workspaceMembership } from "@/db/schema/app";
import { approvalPolicy } from "@/db/schema/approvals";
import { channel } from "@/db/schema/connections";
import { inboxSettings, savedReply } from "@/db/schema/engagement";
import { readGoals, readTracking, type GoalKey, type TrackingSettings } from "@/lib/actions/settings/catalog";
import { auth } from "@/lib/auth";
import type { WorkspaceContext } from "@/lib/session";
import { formatInZone } from "@/lib/time";

export type SectionData = {
  policies: PolicyView[];
  channels: { id: string; name: string; network: string }[];
  sessions: SessionRow[];
  inbox: { minutes: number; replies: SavedReplyRow[] };
  tracking: TrackingSettings;
  goals: GoalKey[];
  prefs: Record<string, boolean>;
};

const EMPTY: SectionData = { policies: [], channels: [], sessions: [], inbox: { minutes: 60, replies: [] }, tracking: readTracking({}), goals: [], prefs: {} };

/** Loads only what the requested section renders. */
export async function loadSection(section: string, ctx: WorkspaceContext): Promise<SectionData> {
  const workspaceId = ctx.workspace.id;
  const data: SectionData = { ...EMPTY };
  if (section === "team") {
    const rows = await db.select().from(approvalPolicy).where(eq(approvalPolicy.workspaceId, workspaceId)).orderBy(approvalPolicy.createdAt);
    data.policies = rows.map((p) => ({ id: p.id, name: p.name, enabled: p.enabled, channelIds: p.rule.channelIds ?? [], authorRoles: p.rule.authorRoles ?? [], approverRoles: p.approverRoles, separationOfDuty: p.separationOfDuty, dueHours: p.dueHours }));
    data.channels = await db.select({ id: channel.id, name: channel.name, network: channel.network }).from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded", "syncing", "action_required"])));
  }
  if (section === "security") {
    const list = await auth.api.listSessions({ headers: await headers() });
    data.sessions = list
      .map((s) => ({ token: s.token, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(), ipAddress: s.ipAddress, userAgent: s.userAgent, current: s.token === ctx.session.session.token }))
      .sort((a, b) => Number(b.current) - Number(a.current) || b.updatedAt.localeCompare(a.updatedAt));
  }
  if (section === "inbox") {
    const [s] = await db.select().from(inboxSettings).where(eq(inboxSettings.workspaceId, workspaceId));
    const replies = await db.select().from(savedReply).where(eq(savedReply.workspaceId, workspaceId)).orderBy(savedReply.title);
    data.inbox = { minutes: s?.firstResponseTargetMinutes ?? 60, replies: replies.map((r) => ({ id: r.id, title: r.title, body: r.body, shortcut: r.shortcut, updatedAt: formatInZone(r.updatedAt, ctx.workspace.timezone, { month: "short", day: "numeric" }) })) };
  }
  if (section === "tracking" || section === "general") {
    const [ws] = await db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, workspaceId));
    data.tracking = readTracking(ws?.settings ?? {});
    data.goals = readGoals(ws?.settings ?? {});
  }
  if (section === "notifications") {
    const [m] = await db.select({ prefs: workspaceMembership.notificationPreferences }).from(workspaceMembership).where(and(eq(workspaceMembership.workspaceId, workspaceId), eq(workspaceMembership.userId, ctx.session.user.id)));
    data.prefs = m?.prefs ?? {};
  }
  return data;
}
