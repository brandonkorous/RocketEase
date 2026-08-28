import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { Composer, type ComposerAsset, type ComposerChannel, type ComposerItem } from "@/components/composer";
import { PageEmpty, AppPage, PageHeader } from "@/components/page-frame";
import { db } from "@/db";
import { asset, assetRendition } from "@/db/schema/assets";
import { contentItem, postVariant } from "@/db/schema/content";
import { createDraft } from "@/lib/actions/content";
import { approvalRequirement, reviewerOptions } from "@/lib/actions/approvals";
import { user } from "@/db/schema/auth";
import { publishableChannels } from "@/lib/content";
import { hasCapability, requireWorkspace } from "@/lib/session";
import { presignGet } from "@/lib/storage";
import { utcToZonedInput } from "@/lib/time";
import { workspacePath } from "@/lib/nav";

export const metadata: Metadata = { title: "Create post" };

export default async function CreatePage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<{ item?: string; asset?: string; error?: string; text?: string }> }) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(workspaceId);

  if (!hasCapability(ctx.workspace, "content.create") && !sp.item) {
    return (
      <AppPage>
        <PageHeader title="Create" />
        <PageEmpty title="You can't create posts in this workspace" description="Your role is read-only here. Ask an owner or admin for the Creator role or higher." primary={{ label: "Back to Home", href: workspacePath(workspaceId, "home") }} />
      </AppPage>
    );
  }

  const channels = await publishableChannels(workspaceId);
  if (channels.length === 0) {
    return (
      <AppPage>
        <PageHeader title="Create" description="Write once, adapt per channel, preview, and schedule." />
        <PageEmpty
          title="Connect a channel to start publishing"
          description="The composer needs at least one connected social channel so it can validate and preview your post for that network."
          primary={{ label: "Connect a channel", href: workspacePath(workspaceId, "accounts") }}
          secondary={{ label: "Back to calendar", href: workspacePath(workspaceId, "calendar") }}
        />
      </AppPage>
    );
  }

  // No item yet: create a draft and land on it (autosave needs an id).
  if (!sp.item) {
    const r = await createDraft(workspaceId);
    if ("itemId" in r) redirect(workspacePath(workspaceId, `create?item=${r.itemId}${sp.asset ? `&asset=${sp.asset}` : ""}${sp.text ? `&text=${encodeURIComponent(sp.text)}` : ""}`));
    redirect(workspacePath(workspaceId, "home"));
  }

  const item = await db.query.contentItem.findFirst({ where: (c, { and, eq, isNull }) => and(eq(c.id, sp.item!), eq(c.workspaceId, workspaceId), isNull(c.deletedAt)) });
  if (!item) redirect(workspacePath(workspaceId, "calendar"));
  if (["publishing", "published", "partially_published"].includes(item.status)) redirect(workspacePath(workspaceId, `posts/${item.id}`));
  const variants = await db.select().from(postVariant).where(eq(postVariant.contentItemId, item.id));

  const assetRows = await db
    .select()
    .from(asset)
    .where(and(eq(asset.workspaceId, workspaceId), isNull(asset.deletedAt), eq(asset.uploadStatus, "ready"), inArray(asset.kind, ["image", "video"])))
    .orderBy(desc(asset.createdAt))
    .limit(200);
  const rends = assetRows.length ? await db.select().from(assetRendition).where(and(inArray(assetRendition.assetId, assetRows.map((a) => a.id)), eq(assetRendition.kind, "thumb"))) : [];
  const assets: ComposerAsset[] = await Promise.all(
    assetRows.map(async (a) => {
      const t = rends.find((r) => r.assetId === a.id);
      return { id: a.id, kind: a.kind as "image" | "video", fileName: a.fileName, altText: a.altText, thumbUrl: t ? await presignGet(t.storageKey) : a.kind === "image" ? await presignGet(a.storageKey) : null, previewUrl: a.kind === "video" ? await presignGet(a.storageKey) : null, scanClean: a.scanStatus === "clean", width: a.width, height: a.height };
    }),
  );

  const channelRows: ComposerChannel[] = channels.map((c) => ({
    id: c.id,
    network: c.network,
    kind: c.kind,
    name: c.name,
    handle: c.handle,
    avatarUrl: c.avatarUrl,
    status: c.status,
    formats: c.capabilities.formats,
    textMax: c.capabilities.limits.textMaxChars ?? null,
    firstComment: Boolean(c.capabilities.limits.firstComment),
    links: c.capabilities.limits.links ?? "inline",
  }));

  const initial: ComposerItem = {
    id: item.id,
    title: item.title,
    status: item.status,
    approvalState: item.approvalState,
    sharedText: item.sharedText || (sp.text ?? ""),
    sharedAssetIds: sp.asset && item.sharedAssetIds.length === 0 && assets.some((a) => a.id === sp.asset) ? [sp.asset] : item.sharedAssetIds,
    link: item.link,
    scheduledAtLocal: item.scheduledAt ? utcToZonedInput(item.scheduledAt, ctx.workspace.timezone) : null,
    channelIds: variants.map((v) => v.channelId),
    variants: Object.fromEntries(variants.map((v) => [v.channelId, { format: v.format, textOverride: v.textOverride, assetIdsOverride: v.assetIdsOverride, firstComment: v.firstComment, linkOverride: v.linkOverride, validation: v.validation?.issues ?? [] }])),
  };

  const approval = await approvalRequirement(workspaceId, item.id);
  const reviewerRows = await reviewerOptions(workspaceId);
  const names = reviewerRows.length ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, reviewerRows.map((r) => r.userId))) : [];
  const reviewers = reviewerRows.filter((r) => r.userId !== ctx.session.user.id).map((r) => ({ userId: r.userId, name: names.find((n) => n.id === r.userId)?.name ?? "Member", role: r.role }));

  return <Composer workspaceId={workspaceId} timezone={ctx.workspace.timezone} item={initial} channels={channelRows} assets={assets} canPublish={hasCapability(ctx.workspace, "content.publish") || ctx.workspace.role === "creator"} approval={approval} reviewers={reviewers} />;
}
