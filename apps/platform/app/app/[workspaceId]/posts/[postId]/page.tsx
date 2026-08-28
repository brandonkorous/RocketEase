import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Badge } from "@wizeworks/silicaui-react";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { AppPage, PageHeader } from "@/components/page-frame";
import { PostActions } from "@/components/post-actions";
import { PostComments, type CommentRow } from "@/components/post-comments";
import { approvalRequest, comment } from "@/db/schema/approvals";
import { NetMark } from "@/components/library-screen";
import { db } from "@/db";
import { auditEvent } from "@/db/schema/app";
import { asset, assetRendition } from "@/db/schema/assets";
import { user } from "@/db/schema/auth";
import { contentItem, contentVersion, postVariant, publishJob } from "@/db/schema/content";
import { channel } from "@/db/schema/connections";
import { resolveVariant } from "@/lib/content";
import { hasCapability, requireWorkspace } from "@/lib/session";
import { presignGet } from "@/lib/storage";
import { formatInZone, utcToZonedInput } from "@/lib/time";
import { workspacePath } from "@/lib/nav";

export const metadata: Metadata = { title: "Post" };

const STATUS: Record<string, { label: string; color: "success" | "warning" | "error" | "neutral" | "info" }> = {
  draft: { label: "Draft", color: "neutral" },
  scheduled: { label: "Scheduled", color: "info" },
  publishing: { label: "Publishing", color: "info" },
  published: { label: "Published", color: "success" },
  partially_published: { label: "Partially published", color: "warning" },
  failed: { label: "Failed", color: "error" },
  canceled: { label: "Canceled", color: "neutral" },
  in_review: { label: "In review", color: "warning" },
  changes_requested: { label: "Changes requested", color: "warning" },
  approved: { label: "Approved", color: "success" },
};

export default async function PostPage({ params }: { params: Promise<{ workspaceId: string; postId: string }> }) {
  const { workspaceId, postId } = await params;
  const ctx = await requireWorkspace(workspaceId);
  const tz = ctx.workspace.timezone;
  const item = await db.query.contentItem.findFirst({ where: (c, { and, eq, isNull }) => and(eq(c.id, postId), eq(c.workspaceId, workspaceId), isNull(c.deletedAt)) });
  if (!item) notFound();

  const variants = await db.select({ v: postVariant, ch: channel }).from(postVariant).innerJoin(channel, eq(channel.id, postVariant.channelId)).where(eq(postVariant.contentItemId, item.id));
  const jobs = variants.length ? await db.select().from(publishJob).where(inArray(publishJob.variantId, variants.map((r) => r.v.id))).orderBy(desc(publishJob.createdAt)) : [];
  const versions = await db.select({ v: contentVersion, by: user.name }).from(contentVersion).leftJoin(user, eq(user.id, contentVersion.createdByUserId)).where(eq(contentVersion.contentItemId, item.id)).orderBy(desc(contentVersion.number));
  const pendingReq = await db.query.approvalRequest.findFirst({ where: (r, { and, eq }) => and(eq(r.contentItemId, item.id), eq(r.state, "pending")) });
  const commentRows = await db.select({ c: comment, by: user.name, image: user.image, vnum: contentVersion.number }).from(comment).leftJoin(user, eq(user.id, comment.authorUserId)).leftJoin(contentVersion, eq(contentVersion.id, comment.versionId)).where(eq(comment.contentItemId, item.id)).orderBy(comment.createdAt);
  const comments: CommentRow[] = commentRows.map((c) => ({ id: c.c.id, by: c.by ?? "—", image: c.image, body: c.c.body, at: formatInZone(c.c.createdAt, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), mine: c.c.authorUserId === ctx.session.user.id, resolved: Boolean(c.c.resolvedAt), version: c.vnum }));
  void approvalRequest;
  const activity = await db.select({ a: auditEvent, by: user.name }).from(auditEvent).leftJoin(user, eq(user.id, auditEvent.actorUserId)).where(and(eq(auditEvent.workspaceId, workspaceId), inArray(auditEvent.targetId, [item.id, ...variants.map((r) => r.v.id)]))).orderBy(desc(auditEvent.createdAt)).limit(30);

  const allAssetIds = [...new Set([...item.sharedAssetIds, ...variants.flatMap((r) => r.v.assetIdsOverride ?? [])])];
  const assets = allAssetIds.length ? await db.select().from(asset).where(inArray(asset.id, allAssetIds)) : [];
  const thumbs = assets.length ? await db.select().from(assetRendition).where(and(inArray(assetRendition.assetId, assets.map((a) => a.id)), eq(assetRendition.kind, "thumb"))) : [];
  const thumbUrl = async (id: string) => {
    const t = thumbs.find((r) => r.assetId === id);
    const a = assets.find((x) => x.id === id);
    if (t) return presignGet(t.storageKey);
    if (a?.kind === "image") return presignGet(a.storageKey);
    return null;
  };
  const sharedThumbs = await Promise.all(item.sharedAssetIds.map(async (id) => ({ id, url: await thumbUrl(id), alt: assets.find((a) => a.id === id)?.altText ?? "" })));

  const st = STATUS[item.status] ?? STATUS.draft;
  const canPublish = hasCapability(ctx.workspace, "content.publish") || ctx.workspace.role === "creator";
  const editable = !["publishing", "published", "partially_published"].includes(item.status);
  const hasFailed = variants.some((r) => r.v.status === "failed");
  const hasScheduled = variants.some((r) => r.v.status === "scheduled");

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
              <PostActions workspaceId={workspaceId} itemId={item.id} canPublish={canPublish} hasFailed={hasFailed} hasScheduled={hasScheduled} scheduledLocal={item.scheduledAt ? utcToZonedInput(item.scheduledAt, tz) : null} timezone={tz} isDraft={item.status === "draft"} />
            </div>
          }
        />
      </div>

      {item.approvalState === "pending" && (
        <div className="mt-6 rounded-box border border-info/40 bg-info/10 px-5 py-3 text-sm">
          <strong>Waiting for approval.</strong> {pendingReq?.dueAt ? `Due ${formatInZone(pendingReq.dueAt, tz)}.` : ""} <Link href={workspacePath(workspaceId, `approvals?request=${pendingReq?.id ?? ""}`)} className="font-medium underline underline-offset-2">Open in Approvals</Link>
        </div>
      )}
      {item.approvalState === "changes_requested" && (
        <div className="mt-6 rounded-box border border-warning/40 bg-warning/10 px-5 py-3 text-sm"><strong>Changes requested.</strong> See the comments below, edit the post, then request approval again.</div>
      )}
      {item.approvalState === "approved" && !["scheduled", "published", "partially_published", "publishing"].includes(item.status) && (
        <div className="mt-6 rounded-box border border-success/40 bg-success/10 px-5 py-3 text-sm"><strong>Approved.</strong> Schedule it from the composer, or it was scheduled automatically if the request asked for that.</div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <section className="rounded-box border border-base-300 p-5" aria-labelledby="dest-h">
            <h2 id="dest-h" className="text-base font-semibold">Destinations</h2>
            <ul className="mt-3 divide-y divide-base-300">
              {variants.map(({ v, ch }) => {
                const vs = STATUS[v.status] ?? STATUS.draft;
                const r = resolveVariant(item, v);
                const job = jobs.find((j) => j.variantId === v.id);
                return (
                  <li key={v.id} className="flex flex-wrap items-start gap-3 py-3">
                    <NetMark network={ch.network} size={20} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{ch.name}</span><Badge size="xs" variant="soft" color={vs.color}>{vs.label}</Badge><span className="text-xs text-secondary/70">{v.format}{v.scheduledAt ? ` · ${formatInZone(v.scheduledAt, tz)}` : ""}</span></div>
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-secondary">{r.text || <em>No text</em>}</p>
                      {v.remoteUrl && (<a href={v.remoteUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-medium text-info hover:underline">View on {ch.network === "mock" ? "Demo network" : ch.network} ↗</a>)}
                      {v.lastError && (<p className="mt-1 rounded-field bg-error/10 px-3 py-2 text-xs text-error"><strong className="capitalize">{v.lastError.category.replace("_", " ")}:</strong> {v.lastError.message}{v.lastError.ambiguous ? " (result was ambiguous; reconciled before retry)" : ""}</p>)}
                      {job && job.state === "reconciling" && <p className="mt-1 text-xs text-secondary/70">Confirming with the network…</p>}
                      {v.validation && v.validation.issues.filter((i) => i.severity === "error").length > 0 && v.status === "draft" && (<p className="mt-1 text-xs text-error">{v.validation.issues.filter((i) => i.severity === "error")[0].message}</p>)}
                    </div>
                    <span className="text-xs text-secondary/70">{v.attempts > 0 ? `${v.attempts} attempt${v.attempts === 1 ? "" : "s"}` : ""}</span>
                  </li>
                );
              })}
              {variants.length === 0 && <li className="py-3 text-sm text-secondary/70">No destinations selected yet.</li>}
            </ul>
          </section>

          <section className="rounded-box border border-base-300 p-5" aria-labelledby="content-h">
            <h2 id="content-h" className="text-base font-semibold">Content</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{item.sharedText || <em className="text-secondary/70">No shared text</em>}</p>
            {item.link && <a href={item.link} className="mt-2 block truncate text-sm text-info" target="_blank" rel="noreferrer">{item.link}</a>}
            {sharedThumbs.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">{sharedThumbs.map((t) => (<li key={t.id} className="h-20 w-20 overflow-hidden rounded-field border border-base-300 bg-base-200">{t.url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.url} alt={t.alt} className="h-full w-full object-cover" />}</li>))}</ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <PostComments workspaceId={workspaceId} itemId={item.id} comments={comments} canComment={hasCapability(ctx.workspace, "content.comment")} />
          <section className="rounded-box border border-base-300 p-5" aria-labelledby="versions-h">
            <h2 id="versions-h" className="text-base font-semibold">Versions</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {versions.map(({ v, by }) => (<li key={v.id} className="flex items-center justify-between"><span>v{v.number} <span className="text-secondary/70">· {v.reason}</span>{item.currentVersionId === v.id && <Badge size="xs" variant="soft" color="neutral" className="ml-2">current</Badge>}</span><span className="text-xs text-secondary/70">{formatInZone(v.createdAt, tz)}{by ? ` · ${by}` : ""}</span></li>))}
              {versions.length === 0 && <li className="text-secondary/70">Versions are created when you schedule or request approval.</li>}
            </ul>
          </section>
          <section className="rounded-box border border-base-300 p-5" aria-labelledby="activity-h">
            <h2 id="activity-h" className="text-base font-semibold">Activity</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {activity.map(({ a, by }) => (<li key={a.id} className="flex items-start justify-between gap-3"><span><span className="font-medium">{a.action.replace(/[._]/g, " ")}</span>{a.summary?.note ? <span className="block text-xs text-secondary">{a.summary.note}</span> : null}</span><span className="shrink-0 text-xs text-secondary/70">{formatInZone(a.createdAt, tz, { dateStyle: "short", timeStyle: "short" })}{by ? ` · ${by}` : ""}</span></li>))}
              {activity.length === 0 && <li className="text-secondary/70">No activity yet.</li>}
            </ul>
          </section>
        </div>
      </div>
    </AppPage>
  );
}
