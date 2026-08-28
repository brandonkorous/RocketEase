/*
 * Turns a trigger reference into the subjects a rule is evaluated against.
 * Worker-safe: no server-only / next/headers imports.
 *
 * One trigger event can fan out (a budget sweep covers every campaign on the
 * ad account); each subject carries its own ref, which is what makes a run
 * idempotent on (rule, triggerRef).
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import type { TriggerKind } from "@/db/schema/automations";
import { approvalDecision } from "@/db/schema/approvals";
import type { Facts } from "./evaluate";
import { inBusinessHours } from "./hours";

export type SubjectContext = {
  conversationId?: string;
  contactId?: string;
  messageId?: string;
  conversationKind?: string;
  channelId?: string;
  variantId?: string;
  contentItemId?: string;
  approvalRequestId?: string;
  campaignId?: string;
};

export type Subject = { refId: string; workspaceId: string; organizationId: string; label: string; href: string | null; facts: Facts; ctx: SubjectContext };

const timezoneOf = async (workspaceId: string) => (await db.select({ tz: workspace.timezone }).from(workspace).where(eq(workspace.id, workspaceId)))[0]?.tz ?? "UTC";

async function inboxSubject(messageId: string): Promise<Subject[]> {
  const m = await db.query.message.findFirst({ where: (x, { eq }) => eq(x.id, messageId) });
  if (!m || m.direction !== "inbound") return [];
  const conv = await db.query.conversation.findFirst({ where: (c, { eq }) => eq(c.id, m.conversationId) });
  if (!conv) return [];
  const [ch, contact, tz] = await Promise.all([
    db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, m.channelId) }),
    db.query.contact.findFirst({ where: (c, { eq }) => eq(c.id, conv.contactId) }),
    timezoneOf(conv.workspaceId),
  ]);
  const facts: Facts = {
    network: ch?.network ?? "",
    channel: ch?.name ?? "",
    kind: conv.kind,
    text: m.body,
    contact_tags: contact?.tags ?? [],
    priority: conv.priority,
    business_hours: inBusinessHours(m.occurredAt, tz),
    first_message: conv.messageCount <= 1,
    rating: m.rating,
  };
  return [{ refId: m.id, workspaceId: conv.workspaceId, organizationId: conv.organizationId, label: `${contact?.displayName ?? "Someone"} on ${ch?.name ?? "a channel"}`, href: `/app/${conv.workspaceId}/inbox/${conv.id}`, facts, ctx: { conversationId: conv.id, contactId: conv.contactId, messageId: m.id, conversationKind: conv.kind, channelId: m.channelId } }];
}

async function publishSubject(variantId: string, failed: boolean): Promise<Subject[]> {
  const v = await db.query.postVariant.findFirst({ where: (x, { eq }) => eq(x.id, variantId) });
  if (!v) return [];
  const [item, ch] = await Promise.all([
    db.query.contentItem.findFirst({ where: (c, { eq }) => eq(c.id, v.contentItemId) }),
    db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, v.channelId) }),
  ]);
  if (!item) return [];
  const camp = item.campaignId ? await db.query.campaign.findFirst({ where: (c, { eq }) => eq(c.id, item.campaignId!) }) : null;
  const facts: Facts = {
    network: ch?.network ?? "",
    channel: ch?.name ?? "",
    campaign: camp?.name ?? "",
    format: v.format,
    title: item.title,
    text: v.textOverride ?? item.sharedText,
    ...(failed ? { failure_category: v.lastError?.category ?? "", failure_message: v.lastError?.message ?? "", ambiguous: Boolean(v.lastError?.ambiguous), attempt: v.attempts } : {}),
  };
  return [{ refId: v.id, workspaceId: v.workspaceId, organizationId: v.organizationId, label: `${item.title} on ${ch?.name ?? "a channel"}`, href: `/app/${v.workspaceId}/posts/${item.id}`, facts, ctx: { variantId: v.id, contentItemId: item.id, channelId: v.channelId, campaignId: item.campaignId ?? undefined } }];
}

async function approvalSubject(requestId: string): Promise<Subject[]> {
  const req = await db.query.approvalRequest.findFirst({ where: (r, { eq }) => eq(r.id, requestId) });
  if (!req || req.state === "pending") return [];
  const item = await db.query.contentItem.findFirst({ where: (c, { eq }) => eq(c.id, req.contentItemId) });
  if (!item) return [];
  const [camp, decisions] = await Promise.all([
    item.campaignId ? db.query.campaign.findFirst({ where: (c, { eq }) => eq(c.id, item.campaignId!) }) : Promise.resolve(null),
    db.select({ comment: approvalDecision.comment }).from(approvalDecision).where(eq(approvalDecision.requestId, req.id)),
  ]);
  const facts: Facts = {
    decision: req.state,
    title: item.title,
    campaign: camp?.name ?? "",
    overdue: Boolean(req.dueAt && req.decidedAt && req.decidedAt > req.dueAt),
    has_comment: decisions.some((d) => Boolean(d.comment?.trim())),
  };
  return [{ refId: req.id, workspaceId: req.workspaceId, organizationId: req.organizationId, label: `${item.title} — ${req.state.replace("_", " ")}`, href: `/app/${req.workspaceId}/approvals?request=${req.id}`, facts, ctx: { approvalRequestId: req.id, contentItemId: item.id, campaignId: item.campaignId ?? undefined } }];
}

/** Spend per campaign from imported paid facts; never typed in by a user. */
async function campaignSpend(adAccountId: string) {
  return (await db.execute(sql`
    select a.campaign_id as campaign_id, coalesce(sum(f.value), 0)::float as spend
    from ad_campaign a
    join ad_account aa on aa.id = a.ad_account_id
    left join metric_fact f on f.channel_id = aa.channel_id and f.scope = 'paid' and f.entity = 'channel' and f.remote_id = a.remote_id and f.metric = 'spend'
    where a.ad_account_id = ${adAccountId} and a.campaign_id is not null
    group by a.campaign_id`)) as unknown as { campaign_id: string; spend: number }[];
}

/** One subject per campaign on the ad account that has a planned budget to measure against. */
async function budgetSubjects(adAccountId: string): Promise<Subject[]> {
  const rows = await campaignSpend(adAccountId);
  const out: Subject[] = [];
  for (const row of rows) {
    const c = await db.query.campaign.findFirst({ where: (x, { and, eq, isNull }) => and(eq(x.id, row.campaign_id), isNull(x.archivedAt)) });
    const budget = c?.budgetAmount ? Number(c.budgetAmount) : 0;
    if (!c || budget <= 0) continue;
    const facts: Facts = { spend_percent: Math.round((row.spend / budget) * 1000) / 10, spend: row.spend, budget, objective: c.objective, status: c.status, campaign: c.name };
    out.push({ refId: c.id, workspaceId: c.workspaceId, organizationId: c.organizationId, label: `${c.name} — ${facts.spend_percent}% of budget`, href: `/app/${c.workspaceId}/campaigns/${c.id}`, facts, ctx: { campaignId: c.id } });
  }
  return out;
}

/** Every campaign with a planned budget, for the nightly sweep. */
export async function budgetSubjectsForWorkspaces(): Promise<Subject[]> {
  const accounts = await db.query.adAccount.findMany({ where: (a, { isNull }) => isNull(a.disconnectedAt) });
  const out: Subject[] = [];
  const seen = new Set<string>();
  for (const a of accounts) {
    for (const s of await budgetSubjects(a.id)) if (!seen.has(s.refId)) { seen.add(s.refId); out.push(s); }
  }
  return out;
}

export async function resolveSubjects(trigger: TriggerKind, refId: string): Promise<Subject[]> {
  switch (trigger) {
    case "inbox.message_received":
      return inboxSubject(refId);
    case "post.published":
      return publishSubject(refId, false);
    case "post.failed":
      return publishSubject(refId, true);
    case "approval.decided":
      return approvalSubject(refId);
    case "campaign.budget_threshold":
      return refId ? budgetSubjects(refId) : budgetSubjectsForWorkspaces();
    default:
      return [];
  }
}
