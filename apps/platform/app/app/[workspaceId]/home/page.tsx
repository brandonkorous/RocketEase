import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import { Badge } from "@wizeworks/silicaui-react";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { NetMark } from "@/components/library-screen";
import { db } from "@/db";
import { contentItem, postVariant } from "@/db/schema/content";
import { channel } from "@/db/schema/connections";
import { hasCapability, requireWorkspace } from "@/lib/session";
import { formatInZone } from "@/lib/time";
import { workspacePath } from "@/lib/nav";
import { conversationSummary } from "@/lib/engagement/summary";
import { Checklist, loadChecklist } from "./checklist";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { workspace, session } = await requireWorkspace(workspaceId);
  const tz = workspace.timezone;

  const [channels, checklist, failed, upcoming, recentPublished, [{ n: scheduledCount }], convs] = await Promise.all([
    db.select().from(channel).where(and(eq(channel.workspaceId, workspaceId), ne(channel.status, "disconnected"))),
    loadChecklist(workspaceId),
    db.select({ item: contentItem }).from(contentItem).where(and(eq(contentItem.workspaceId, workspaceId), isNull(contentItem.deletedAt), inArray(contentItem.status, ["failed", "partially_published"]))).orderBy(desc(contentItem.updatedAt)).limit(5),
    db.select({ v: postVariant, item: contentItem, ch: channel }).from(postVariant).innerJoin(contentItem, eq(contentItem.id, postVariant.contentItemId)).innerJoin(channel, eq(channel.id, postVariant.channelId)).where(and(eq(postVariant.workspaceId, workspaceId), eq(postVariant.status, "scheduled"), gte(postVariant.scheduledAt, new Date()))).orderBy(postVariant.scheduledAt).limit(6),
    db.select({ item: contentItem }).from(contentItem).where(and(eq(contentItem.workspaceId, workspaceId), isNull(contentItem.deletedAt), eq(contentItem.status, "published"))).orderBy(desc(contentItem.updatedAt)).limit(5),
    db.select({ n: count() }).from(contentItem).where(and(eq(contentItem.workspaceId, workspaceId), isNull(contentItem.deletedAt), eq(contentItem.status, "scheduled"))),
    conversationSummary(workspaceId, session.user.id, tz),
  ]);
  const disconnected = channels.filter((c) => c.status === "action_required" || c.status === "revoked");
  const hasPosts = Number(scheduledCount) > 0 || recentPublished.length > 0;
  const firstName = session.user.name.split(" ")[0];
  const canCreate = hasCapability(workspace, "content.create");
  const allDone = checklist.allDone;
  const attention = failed.length + disconnected.length;

  return (
    <div className="mx-auto w-full max-w-360 px-6 py-5 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="app-title">{allDone ? `Good to see you, ${firstName}.` : `Welcome to Make It Social, ${firstName}! 👋`}</h1>
          <p className="mt-1 text-base text-secondary">{allDone ? `${workspace.name} · ${tz}` : "Let's get you set up to plan, publish, and grow your brand."}</p>
        </div>
        {canCreate && <Link href={workspacePath(workspaceId, "create")} className={buttonClasses({ color: "primary" })}>{hasPosts ? "Create post" : "Create your first post"}</Link>}
      </div>

      {attention > 0 && (
        <section className="mt-5 rounded-box border border-error/40 bg-error/10 p-5" aria-labelledby="attention-h">
          <h2 id="attention-h" className="text-base font-semibold text-error">Needs attention ({attention})</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {disconnected.map((c) => (<li key={c.id}><Link href={workspacePath(workspaceId, "accounts")} className="hover:underline"><NetMark network={c.network} size={14} /> <strong>{c.name}</strong> needs to be reconnected{c.health.message ? ` — ${c.health.message}` : ""}.</Link></li>))}
            {failed.map(({ item }) => (<li key={item.id}><Link href={workspacePath(workspaceId, `posts/${item.id}`)} className="hover:underline"><strong>{item.title}</strong> {item.status === "partially_published" ? "published to some destinations only" : "failed to publish"}. Open to retry.</Link></li>))}
          </ul>
        </section>
      )}

      {!allDone && <Checklist steps={checklist.steps} />}

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <Card title="Connected accounts" href={workspacePath(workspaceId, "accounts")} linkLabel="Manage">
          {channels.length === 0 ? (
            <Empty title="You haven't connected any accounts yet" body="Connect your social accounts to start publishing and managing your content in one place." cta="Connect accounts" href={workspacePath(workspaceId, "accounts")} learn="Learn more about connecting accounts" />
          ) : (
            <ul className="flex flex-col gap-2">{channels.map((c) => (<li key={c.id} className="flex items-center gap-2 text-sm"><NetMark network={c.network} size={16} /><span className="min-w-0 flex-1 truncate font-medium">{c.name}</span><Badge size="xs" variant="soft" color={c.status === "healthy" ? "success" : c.status === "action_required" ? "error" : "warning"}>{c.status.replace("_", " ")}</Badge></li>))}</ul>
          )}
        </Card>
        <Card title="Content calendar" href={workspacePath(workspaceId, "calendar")} linkLabel="View calendar">
          {upcoming.length === 0 ? (
            <Empty title="Your calendar is empty" body="Plan and schedule your content across all your connected platforms." cta={hasPosts ? "Create post" : "Create your first post"} href={workspacePath(workspaceId, "create")} learn="Learn how scheduling works" />
          ) : (
            <ul className="flex flex-col gap-2">{upcoming.map(({ v, item, ch }) => (<li key={v.id}><Link href={workspacePath(workspaceId, `posts/${item.id}`)} className="flex items-center gap-2 text-sm hover:underline"><NetMark network={ch.network} size={14} /><span className="min-w-0 flex-1 truncate">{item.title}</span><span className="text-xs text-secondary/70">{v.scheduledAt ? formatInZone(v.scheduledAt, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</span></Link></li>))}</ul>
          )}
        </Card>
        <Card title="Inbox" href={workspacePath(workspaceId, "inbox")} linkLabel="Open">
          {convs.recent.length === 0 ? (
            <Empty title="No open conversations" body={channels.length ? "Messages, comments, and mentions from your connected channels land here." : "Your messages, comments, and mentions will appear here once you connect your accounts."} cta={channels.length ? "Open inbox" : "Connect accounts"} href={workspacePath(workspaceId, channels.length ? "inbox" : "accounts")} learn="Learn about the inbox" />
          ) : (
            <>
              <p className="mb-2 text-xs text-secondary">{convs.unresolved} unresolved · {convs.unread} unread · {convs.assignedToMe} assigned to you</p>
              <ul className="flex flex-col gap-2">{convs.recent.map((c) => (<li key={c.id}><Link href={workspacePath(workspaceId, `inbox/${c.id}`)} className="flex items-center gap-2 text-sm hover:underline"><NetMark network={c.network} size={14} /><span className={`shrink-0 ${c.unread ? "font-semibold" : ""}`}>{c.name}</span><span className="min-w-0 flex-1 truncate text-secondary">{c.preview}</span><span className="text-xs text-secondary/70">{c.lastAt}</span></Link></li>))}</ul>
            </>
          )}
        </Card>
        <Card title="Performance overview" href={workspacePath(workspaceId, "analytics")} linkLabel="Analytics">
          <Empty title="No data yet" body="Once you publish content, your performance insights will appear here." cta="Learn how analytics work" href={workspacePath(workspaceId, "analytics")} />
        </Card>
        <Card title="Top posts" href={workspacePath(workspaceId, "analytics")} linkLabel="Analytics">
          {recentPublished.length === 0 ? (
            <Empty title="No posts yet" body="Your top-performing posts will be shown here once you start publishing." cta="Create your first post" href={workspacePath(workspaceId, "create")} />
          ) : (
            <ul className="flex flex-col gap-2">{recentPublished.map(({ item }) => (<li key={item.id}><Link href={workspacePath(workspaceId, `posts/${item.id}`)} className="flex items-center justify-between text-sm hover:underline"><span className="min-w-0 truncate">{item.title}</span><span className="text-xs text-secondary/70">published</span></Link></li>))}<li className="text-xs text-secondary/70">Engagement ranking arrives with analytics.</li></ul>
          )}
        </Card>
        <Card title="Campaigns" href={workspacePath(workspaceId, "campaigns")} linkLabel="Campaigns">
          <Empty title="No campaigns yet" body="Create campaigns to track performance and achieve your goals." cta="Create your first campaign" href={workspacePath(workspaceId, "campaigns")} learn="Learn about campaigns" />
        </Card>
      </div>

      <section className="mt-5 flex flex-col gap-3 rounded-box border border-base-300 bg-base-200 p-5 md:flex-row md:items-center md:justify-between" aria-label="Help">
        <div><h2 className="text-base font-semibold">Need help getting started?</h2><p className="text-sm text-secondary">Explore guides, watch tutorials, or chat with our support team.</p></div>
        <div className="flex flex-wrap gap-2"><a href="https://make-it-social.com/help" className={buttonClasses({ variant: "outline", color: "neutral", size: "sm" })}>View help center</a><a href="mailto:support@make-it-social.com" className={buttonClasses({ variant: "outline", color: "neutral", size: "sm" })}>Contact support</a></div>
      </section>
    </div>
  );
}

function Card({ title, href, linkLabel, children }: { title: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <section className="rounded-box border border-base-300 p-5" aria-label={title}>
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold">{title}</h2><Link href={href} className="text-xs font-medium hover:underline">{linkLabel}</Link></div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ title, body, cta, href, learn }: { title: string; body: string; cta: string; href: string; learn?: string }) {
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <div className="h-14 w-20 rounded-lg border border-dashed border-base-300" aria-hidden="true" />
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-65 text-xs leading-normal text-secondary">{body}</p>
      <Link href={href} className={`${buttonClasses({ color: "primary", size: "sm" })} mt-3`}>{cta}</Link>
      {learn && <span className="mt-2 text-xs text-secondary/70">{learn} →</span>}
    </div>
  );
}
