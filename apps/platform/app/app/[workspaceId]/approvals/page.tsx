import type { Metadata } from "next";
import { Suspense } from "react";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { ApprovalsScreen, type ApprovalRow, type ApprovalsData, type Reviewer } from "@/components/approvals-screen";
import { db } from "@/db";
import { workspaceMembership } from "@/db/schema/app";
import { approvalDecision, approvalRequest, comment } from "@/db/schema/approvals";
import { asset, assetRendition } from "@/db/schema/assets";
import { user } from "@/db/schema/auth";
import { contentItem, contentVersion, postVariant } from "@/db/schema/content";
import { channel } from "@/db/schema/connections";
import { canDecide } from "@/lib/approvals";
import { pendingAutomationApprovals } from "@/lib/automations/queries";
import { hasCapability, requireWorkspace } from "@/lib/session";
import { presignGet } from "@/lib/storage";
import { formatInZone } from "@/lib/time";

export const metadata: Metadata = { title: "Approvals" };

type SP = { tab?: string; assignee?: string; channel?: string; request?: string; sort?: string };

export default async function ApprovalsPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<SP> }) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(workspaceId);
  const tz = ctx.workspace.timezone;
  const me = { userId: ctx.session.user.id, role: ctx.workspace.role, grants: ctx.workspace.grants };

  const requests = await db
    .select({ r: approvalRequest, item: contentItem, requester: user.name })
    .from(approvalRequest)
    .innerJoin(contentItem, eq(contentItem.id, approvalRequest.contentItemId))
    .leftJoin(user, eq(user.id, approvalRequest.requestedByUserId))
    .where(and(eq(approvalRequest.workspaceId, workspaceId), isNull(contentItem.deletedAt)))
    .orderBy(sp.sort === "newest" ? desc(approvalRequest.createdAt) : approvalRequest.dueAt)
    .limit(200);

  // Client approvers see only what is assigned to them (permissions.md "Agency safety").
  const visible = ctx.workspace.role === "client_approver" ? requests.filter((x) => x.r.assigneeUserId === me.userId) : requests;

  const itemIds = [...new Set(visible.map((x) => x.item.id))];
  const [variants, members, assetsAll] = await Promise.all([
    itemIds.length ? db.select({ v: postVariant, ch: channel }).from(postVariant).innerJoin(channel, eq(channel.id, postVariant.channelId)).where(inArray(postVariant.contentItemId, itemIds)) : [],
    db.select({ userId: workspaceMembership.userId, role: workspaceMembership.role, name: user.name, image: user.image }).from(workspaceMembership).innerJoin(user, eq(user.id, workspaceMembership.userId)).where(eq(workspaceMembership.workspaceId, workspaceId)),
    Promise.resolve([] as { id: string }[]),
  ]);
  void assetsAll;
  const memberByUser = new Map(members.map((m) => [m.userId, m]));
  const reviewers: Reviewer[] = members.filter((m) => ["owner", "admin", "manager", "client_approver"].includes(m.role)).map((m) => ({ userId: m.userId, name: m.name, role: m.role, image: m.image }));

  const firstAssetIds = [...new Set(visible.map((x) => x.item.sharedAssetIds[0]).filter((a): a is string => Boolean(a)))];
  const thumbs = firstAssetIds.length ? await db.select().from(assetRendition).where(and(inArray(assetRendition.assetId, firstAssetIds), eq(assetRendition.kind, "thumb"))) : [];
  const originals = firstAssetIds.length ? await db.select({ id: asset.id, key: asset.storageKey, kind: asset.kind, alt: asset.altText }).from(asset).where(inArray(asset.id, firstAssetIds)) : [];
  const thumbFor = async (id?: string) => {
    if (!id) return null;
    const t = thumbs.find((r) => r.assetId === id);
    const o = originals.find((a) => a.id === id);
    return t ? presignGet(t.storageKey) : o?.kind === "image" ? presignGet(o.key) : null;
  };

  const rows: ApprovalRow[] = await Promise.all(
    visible.map(async ({ r, item, requester }) => {
      const vs = variants.filter((v) => v.v.contentItemId === item.id);
      const assignee = r.assigneeUserId ? memberByUser.get(r.assigneeUserId) : null;
      const gate = r.state === "pending" ? canDecide(me, r) : { ok: false, reason: "Not pending" };
      return {
        id: r.id, itemId: item.id, title: item.title, text: item.sharedText, state: r.state, itemStatus: item.status,
        channels: vs.map((v) => ({ id: v.ch.id, name: v.ch.name, network: v.ch.network })),
        thumbUrl: await thumbFor(item.sharedAssetIds[0]),
        requester: requester ?? "Unknown", requesterId: r.requestedByUserId, assignee: assignee ? { userId: assignee.userId, name: assignee.name, role: assignee.role, image: assignee.image } : null,
        dueAt: r.dueAt?.toISOString() ?? null, dueLabel: r.dueAt ? formatInZone(r.dueAt, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null, overdue: Boolean(r.dueAt && r.dueAt < new Date() && r.state === "pending"),
        createdAt: formatInZone(r.createdAt, tz, { dateStyle: "medium", timeStyle: "short" }), note: r.note, scheduleOnApprove: r.scheduleOnApprove, versionId: r.versionId, stale: Boolean(item.currentVersionId && item.currentVersionId !== r.versionId),
        canDecide: gate.ok, decideReason: gate.reason ?? null, canCancel: r.state === "pending" && (r.requestedByUserId === me.userId || ["owner", "admin"].includes(me.role)),
      };
    }),
  );

  // Detail for the selected request.
  const selectedId = sp.request && rows.some((r) => r.id === sp.request) ? sp.request : rows.find((r) => r.state === "pending")?.id ?? rows[0]?.id ?? null;
  let detail: ApprovalsData["detail"] = null;
  if (selectedId) {
    const row = rows.find((r) => r.id === selectedId)!;
    const [versions, decisions, comments] = await Promise.all([
      db.select({ v: contentVersion, by: user.name }).from(contentVersion).leftJoin(user, eq(user.id, contentVersion.createdByUserId)).where(eq(contentVersion.contentItemId, row.itemId)).orderBy(desc(contentVersion.number)),
      db.select({ d: approvalDecision, by: user.name }).from(approvalDecision).leftJoin(user, eq(user.id, approvalDecision.decidedByUserId)).where(eq(approvalDecision.requestId, row.id)).orderBy(approvalDecision.createdAt),
      db.select({ c: comment, by: user.name, image: user.image }).from(comment).leftJoin(user, eq(user.id, comment.authorUserId)).where(eq(comment.contentItemId, row.itemId)).orderBy(comment.createdAt),
    ]);
    const ver = versions.find((v) => v.v.id === row.versionId);
    const snapshot = ver?.v.snapshot;
    const previewAssetIds = snapshot?.sharedAssetIds ?? [];
    const pThumbs = previewAssetIds.length ? await db.select().from(assetRendition).where(and(inArray(assetRendition.assetId, previewAssetIds), eq(assetRendition.kind, "preview"))) : [];
    const pOrig = previewAssetIds.length ? await db.select({ id: asset.id, key: asset.storageKey, kind: asset.kind, alt: asset.altText }).from(asset).where(inArray(asset.id, previewAssetIds)) : [];
    const media = await Promise.all(previewAssetIds.map(async (id) => { const t = pThumbs.find((r) => r.assetId === id); const o = pOrig.find((a) => a.id === id); return { id, kind: o?.kind ?? "image", url: t ? await presignGet(t.storageKey) : o?.kind === "image" ? await presignGet(o.key) : null, fullUrl: o ? await presignGet(o.key) : null, alt: o?.alt ?? "" }; }));
    detail = {
      ...row,
      snapshot: snapshot ? { text: snapshot.sharedText, link: snapshot.link, firstComment: snapshot.variants.find((v) => v.firstComment)?.firstComment ?? null, schedule: snapshot.variants.find((v) => v.scheduledAt)?.scheduledAt ?? null, media } : null,
      versions: versions.map((v) => ({ id: v.v.id, number: v.v.number, reason: v.v.reason, by: v.by, at: formatInZone(v.v.createdAt, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), current: v.v.id === row.versionId })),
      timeline: [
        { kind: "submitted", label: "Submitted", by: row.requester, at: row.createdAt },
        ...(row.assignee ? [{ kind: "assigned", label: "Assigned", by: `to ${row.assignee.name}`, at: row.createdAt }] : []),
        ...decisions.map((d) => ({ kind: d.d.decision, label: d.d.decision.replace("_", " "), by: d.by ?? "—", at: formatInZone(d.d.createdAt, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) })),
        ...(row.state === "pending" ? [{ kind: "pending", label: "Pending review", by: row.assignee?.name ?? "Approvers", at: "Current step" }] : []),
      ],
      comments: comments.map((c) => ({ id: c.c.id, by: c.by ?? "—", image: c.image, body: c.c.body, at: formatInZone(c.c.createdAt, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), mine: c.c.authorUserId === me.userId, resolved: Boolean(c.c.resolvedAt), field: c.c.field, assetId: c.c.assetId, parentId: c.c.parentId })),
    };
  }

  const counts = { all: rows.length, pending: rows.filter((r) => r.state === "pending").length, changes: rows.filter((r) => r.state === "changes_requested" || r.state === "rejected").length, approved: rows.filter((r) => r.state === "approved").length, scheduled: rows.filter((r) => r.state === "approved" && ["scheduled", "published"].includes(r.itemStatus)).length };
  const tab = sp.tab ?? "pending";
  const filtered = rows.filter((r) => (tab === "all" ? true : tab === "pending" ? r.state === "pending" : tab === "changes" ? r.state === "changes_requested" || r.state === "rejected" : tab === "approved" ? r.state === "approved" : tab === "scheduled" ? r.state === "approved" && ["scheduled", "published"].includes(r.itemStatus) : true) && (!sp.assignee || r.assignee?.userId === sp.assignee) && (!sp.channel || r.channels.some((c) => c.id === sp.channel)));

  const data: ApprovalsData = {
    workspaceId, timezone: tz, tab, counts, rows: filtered, detail, reviewers, channels: [...new Map(variants.map((v) => [v.ch.id, { id: v.ch.id, name: v.ch.name, network: v.ch.network }])).values()],
    filters: { assignee: sp.assignee ?? "", channel: sp.channel ?? "", sort: sp.sort ?? "due" }, canComment: hasCapability(ctx.workspace, "content.comment"), isClientApprover: ctx.workspace.role === "client_approver",
    automations: await pendingAutomationApprovals(workspaceId, tz, { role: ctx.workspace.role }),
  };
  return (
    <Suspense>
      <ApprovalsScreen data={data} />
    </Suspense>
  );
}
