import "server-only";
import { headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import type { SessionRow } from "@/components/security-panel";
import type { PolicyView } from "@/components/approval-policies";
import type { GrantRow } from "@/components/settings/rights-grants";
import type { SavedReplyRow } from "@/components/settings/saved-replies";
import { db } from "@/db";
import { workspace, workspaceMembership } from "@/db/schema/app";
import { approvalPolicy } from "@/db/schema/approvals";
import { channel } from "@/db/schema/connections";
import { inboxSettings, savedReply } from "@/db/schema/engagement";
import { automationsData, EMPTY_AUTOMATIONS, type AutomationsData } from "@/lib/automations/queries";
import { ssoSectionData, EMPTY_SSO, type SsoSectionData } from "@/lib/sso/queries";
import { apiKeysData, EMPTY_API_KEYS, type ApiKeysData } from "@/lib/api/queries";
import { auditLogData, parseAuditFilters, EMPTY_AUDIT, type AuditLogData } from "@/lib/audit/queries";
import { billingData, EMPTY_BILLING, type BillingData } from "@/lib/billing/queries";
import { readGoals, readRecycling, readTracking, type GoalKey, type TrackingSettings } from "@/lib/actions/settings/catalog";
import { listHashtagSets, type HashtagSetRow } from "@/lib/actions/hashtag-sets";
import { recyclingData, EMPTY_RECYCLING, type RecyclingData } from "@/lib/recycling/queries";
import { listGrants } from "@/lib/rights/queries";
import { grantRows } from "@/lib/rights/view";
import { conversionState } from "@/lib/tracking/conversions";
import { trackingKindEnabled } from "@/lib/tracking/sources";
import { trackingWebhookUrl } from "@/lib/tracking/oauth-state";
import type { TrackingSourcesProps } from "@/components/settings/tracking-sources";
import { auth } from "@/lib/auth";
import { hasCapability, type WorkspaceContext } from "@/lib/session";
import { formatInZone } from "@/lib/time";

export type SectionData = {
  policies: PolicyView[];
  channels: { id: string; name: string; network: string }[];
  sessions: SessionRow[];
  inbox: { minutes: number; replies: SavedReplyRow[] };
  tracking: TrackingSettings;
  sources: TrackingSourcesProps["sources"];
  sourceKinds: TrackingSourcesProps["enabled"];
  goals: GoalKey[];
  prefs: Record<string, boolean>;
  automations: AutomationsData;
  sso: SsoSectionData;
  apiKeys: ApiKeysData;
  grants: GrantRow[];
  hashtagSets: HashtagSetRow[];
  recycling: RecyclingData;
  billing: BillingData;
  audit: AuditLogData;
};

const EMPTY: SectionData = { policies: [], channels: [], sessions: [], inbox: { minutes: 60, replies: [] }, tracking: readTracking({}), sources: [], sourceKinds: { ga4: false, shopify: false }, goals: [], prefs: {}, automations: EMPTY_AUTOMATIONS, sso: EMPTY_SSO, apiKeys: EMPTY_API_KEYS, grants: [], hashtagSets: [], recycling: EMPTY_RECYCLING, billing: EMPTY_BILLING, audit: EMPTY_AUDIT };

/** Conversion sources as the settings list renders them (freshness in the workspace timezone). */
async function trackingSourceRows(workspaceId: string, tz: string): Promise<SectionData["sources"]> {
  const state = await conversionState(workspaceId);
  return state.sources.map((s) => ({
    id: s.id,
    kind: s.kind,
    kindLabel: s.kindLabel,
    name: s.name,
    status: s.status,
    window: s.window,
    lastSyncLabel: s.lastSyncAt ? formatInZone(s.lastSyncAt, tz) : null,
    message: s.message,
    endpoint: s.kind === "webhook" ? trackingWebhookUrl(s.id) : null,
  }));
}

/** Loads only what the requested section renders. */
export async function loadSection(section: string, ctx: WorkspaceContext, sp: Record<string, string | string[] | undefined> = {}): Promise<SectionData> {
  const workspaceId = ctx.workspace.id;
  const data: SectionData = { ...EMPTY };
  if (section === "audit") {
    const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
    data.audit = await auditLogData(workspaceId, parseAuditFilters({ action: one("action"), actor: one("actor"), from: one("from"), to: one("to") }), one("cursor"), hasCapability(ctx.workspace, "reports.export"));
  }
  if (section === "team") {
    const rows = await db.select().from(approvalPolicy).where(eq(approvalPolicy.workspaceId, workspaceId)).orderBy(approvalPolicy.createdAt);
    data.policies = rows.map((p) => ({ id: p.id, name: p.name, enabled: p.enabled, channelIds: p.rule.channelIds ?? [], authorRoles: p.rule.authorRoles ?? [], approverRoles: p.approverRoles, separationOfDuty: p.separationOfDuty, dueHours: p.dueHours }));
    data.channels = await db.select({ id: channel.id, name: channel.name, network: channel.network }).from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded", "syncing", "action_required"])));
  }
  if (section === "rights") {
    const [grants, channels] = await Promise.all([
      listGrants(workspaceId),
      db.select({ id: channel.id, name: channel.name, network: channel.network }).from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded", "syncing", "action_required"]))),
    ]);
    data.channels = channels;
    data.grants = grantRows(grants, channels, ctx.workspace.timezone);
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
  if (section === "tracking") {
    data.sources = await trackingSourceRows(workspaceId, ctx.workspace.timezone);
    data.sourceKinds = { ga4: trackingKindEnabled("ga4"), shopify: trackingKindEnabled("shopify") };
  }
  if (section === "automations") {
    data.automations = await automationsData(workspaceId, ctx.workspace.timezone);
  }
  if (section === "hashtags") {
    data.hashtagSets = await listHashtagSets(workspaceId);
    data.channels = await db.select({ id: channel.id, name: channel.name, network: channel.network }).from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded", "syncing", "action_required"])));
  }
  if (section === "recycling") {
    const [ws] = await db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, workspaceId));
    data.recycling = await recyclingData(workspaceId, ctx.workspace.timezone, readRecycling(ws?.settings ?? {}).autoSchedule);
  }
  if (section === "sso") {
    data.sso = await ssoSectionData(ctx);
  }
  if (section === "billing") {
    data.billing = await billingData({
      organizationId: ctx.workspace.organizationId,
      organizationName: ctx.workspace.organizationName,
      userId: ctx.session.user.id,
      timezone: ctx.workspace.timezone,
    });
  }
  if (section === "api") {
    data.apiKeys = await apiKeysData(ctx);
  }
  if (section === "notifications") {
    const [m] = await db.select({ prefs: workspaceMembership.notificationPreferences }).from(workspaceMembership).where(and(eq(workspaceMembership.workspaceId, workspaceId), eq(workspaceMembership.userId, ctx.session.user.id)));
    data.prefs = m?.prefs ?? {};
  }
  return data;
}
