import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Badge } from "@wizeworks/silicaui-react";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { AppPage, PageHeader } from "@/components/page-frame";
import { PostActions } from "@/components/post-actions";
import { PostComments } from "@/components/post-comments";
import { Destinations } from "@/components/post-detail/destinations";
import { PostMedia } from "@/components/post-detail/media";
import { Performance } from "@/components/post-detail/performance";
import { PublishReceipts } from "@/components/post-detail/publish-receipt";
import { Reuse } from "@/components/post-detail/reuse";
import { Activity, Versions } from "@/components/post-detail/side-panels";
import { statusOf } from "@/components/post-detail/status";
import { db } from "@/db";
import { auditEvent } from "@/db/schema/app";
import { user } from "@/db/schema/auth";
import { contentVersion, postVariant, publishJob } from "@/db/schema/content";
import { channel } from "@/db/schema/connections";
import { postPerformance } from "@/lib/analytics/post-performance";
import { recommendationsForItem } from "@/lib/recommendations/store";
import { hasCapability, requireWorkspace } from "@/lib/session";
import { formatInZone, utcToZonedInput } from "@/lib/time";
import { workspacePath } from "@/lib/nav";
import { ApprovalBanner } from "./banners";
import { loadComments, loadContent, loadReceipts } from "./load";

export const metadata: Metadata = { title: "Post" };

export default async function PostPage({ params }: { params: Promise<{ workspaceId: string; postId: string }> }) {
  const { workspaceId, postId } = await params;
  const ctx = await requireWorkspace(workspaceId);
  const tz = ctx.workspace.timezone;
  const item = await db.query.contentItem.findFirst({ where: (c, { and, eq, isNull }) => and(eq(c.id, postId), eq(c.workspaceId, workspaceId), isNull(c.deletedAt)) });
  if (!item) notFound();

  const variants = await db.select({ v: postVariant, ch: channel }).from(postVariant).innerJoin(channel, eq(channel.id, postVariant.channelId)).where(eq(postVariant.contentItemId, item.id));
  const variantIds = variants.map((r) => r.v.id);
  const [jobs, versionRows, pendingReq, comments, content, perf, recs, activity] = await Promise.all([
    variantIds.length ? db.select().from(publishJob).where(inArray(publishJob.variantId, variantIds)).orderBy(desc(publishJob.createdAt)) : Promise.resolve([]),
    db.select({ v: contentVersion, by: user.name }).from(contentVersion).leftJoin(user, eq(user.id, contentVersion.createdByUserId)).where(eq(contentVersion.contentItemId, item.id)).orderBy(desc(contentVersion.number)),
    db.query.approvalRequest.findFirst({ where: (r, { and, eq }) => and(eq(r.contentItemId, item.id), eq(r.state, "pending")) }),
    loadComments(item.id, ctx.session.user.id, tz),
    loadContent(item, variants.map((r) => r.v)),
    postPerformance(workspaceId, item.id),
    recommendationsForItem(workspaceId, item.id),
    db.select({ a: auditEvent, by: user.name }).from(auditEvent).leftJoin(user, eq(user.id, auditEvent.actorUserId)).where(and(eq(auditEvent.workspaceId, workspaceId), inArray(auditEvent.targetId, [item.id, ...variantIds]))).orderBy(desc(auditEvent.createdAt)).limit(30),
  ]);

  const receipts = await loadReceipts(item, variants, jobs);
  const st = statusOf(item.status);
  const canPublish = hasCapability(ctx.workspace, "content.publish") || ctx.workspace.role === "creator";
  const editable = !["publishing", "published", "partially_published"].includes(item.status);

  return (
    <AppPage>
      <nav className="text-sm text-secondary/70" aria-label="Breadcrumb"><Link href={workspacePath(workspaceId, "calendar")} className="hover:underline">Calendar</Link> <span className="mx-1">›</span> <span className="text-base-content">{item.title}</span></nav>
      <div className="mt-2">
        <PageHeader
          title={item.title}
          description={item.scheduledAt ? `${item.status === "published" ? "Published" : "Scheduled for"} ${formatInZone(item.scheduledAt, tz)} · ${tz}` : "Not scheduled"}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="soft" color={st.color}>{st.label}</Badge>
              {editable && hasCapability(ctx.workspace, "content.edit") && (<Link href={workspacePath(workspaceId, `create?item=${item.id}`)} className={buttonClasses({ variant: "outline", color: "neutral" })}>Edit</Link>)}
              <PostActions
                workspaceId={workspaceId} itemId={item.id} canPublish={canPublish}
                hasFailed={variants.some((r) => r.v.status === "failed")} hasScheduled={variants.some((r) => r.v.status === "scheduled")}
                scheduledLocal={item.scheduledAt ? utcToZonedInput(item.scheduledAt, tz) : null} timezone={tz} isDraft={item.status === "draft"}
              />
            </div>
          }
        />
      </div>

      <ApprovalBanner workspaceId={workspaceId} item={item} dueAt={pendingReq?.dueAt ?? null} requestId={pendingReq?.id ?? null} tz={tz} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Destinations item={item} variants={variants} tz={tz} />
          <PublishReceipts receipts={receipts} tz={tz} />
          <Performance perf={perf} tz={tz} />
          <section className="rounded-box border border-base-300 p-5" aria-labelledby="content-h">
            <h2 id="content-h" className="text-base font-semibold">Content</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{item.sharedText || <em className="text-secondary/70">No shared text</em>}</p>
            {item.link && <a href={item.link} className="mt-2 block truncate text-sm text-info" target="_blank" rel="noreferrer">{item.link}</a>}
            {content.thumbs.length > 0 && <PostMedia thumbs={content.thumbs} />}
          </section>
          <Reuse workspaceId={workspaceId} itemId={item.id} title={item.title} canCreate={hasCapability(ctx.workspace, "content.create")} recs={recs} />
        </div>

        <div className="flex flex-col gap-6">
          <PostComments workspaceId={workspaceId} itemId={item.id} comments={comments} canComment={hasCapability(ctx.workspace, "content.comment")} />
          <Versions versions={versionRows.map(({ v, by }) => ({ id: v.id, number: v.number, reason: v.reason, createdAt: v.createdAt, by }))} currentVersionId={item.currentVersionId} tz={tz} />
          <Activity activity={activity} tz={tz} />
        </div>
      </div>
    </AppPage>
  );
}
