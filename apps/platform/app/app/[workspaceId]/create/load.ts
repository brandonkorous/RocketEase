import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { ComposerAsset, ComposerChannel, ComposerItem, ComposerProps } from "@/components/composer";
import { db } from "@/db";
import { workspace as workspaceTable } from "@/db/schema/app";
import { asset, assetRendition } from "@/db/schema/assets";
import { user } from "@/db/schema/auth";
import { contentItem, postVariant } from "@/db/schema/content";
import { createDraft } from "@/lib/actions/content";
import { approvalRequirement, reviewerOptions } from "@/lib/actions/approvals";
import { createFromTemplate, listTemplates } from "@/lib/actions/templates";
import { readTracking } from "@/lib/actions/settings/catalog";
import { publishableChannels } from "@/lib/content";
import { hasCapability, type WorkspaceContext } from "@/lib/session";
import { presignGet } from "@/lib/storage";
import { utcToZonedInput } from "@/lib/time";
import { workspacePath } from "@/lib/nav";

export type CreateSearch = { item?: string; asset?: string; error?: string; text?: string; template?: string };
export type ComposerLoad = { kind: "no_capability" } | { kind: "no_channels" } | { kind: "redirect"; to: string } | { kind: "ready"; props: ComposerProps };

/** Shared by the desktop composer and mobile quick compose. `base` is the page segment to land on. */
export async function loadComposer(ctx: WorkspaceContext, sp: CreateSearch, base: "create" | "create/quick"): Promise<ComposerLoad> {
  const workspaceId = ctx.workspace.id;
  if (!hasCapability(ctx.workspace, "content.create") && !sp.item) return { kind: "no_capability" };
  const channels = await publishableChannels(workspaceId);
  if (channels.length === 0) return { kind: "no_channels" };

  if (!sp.item) {
    const r = sp.template ? await createFromTemplate(workspaceId, sp.template) : await createDraft(workspaceId);
    if (!("itemId" in r)) return { kind: "redirect", to: workspacePath(workspaceId, "home") };
    const extra = `${sp.asset ? `&asset=${sp.asset}` : ""}${sp.text ? `&text=${encodeURIComponent(sp.text)}` : ""}`;
    return { kind: "redirect", to: workspacePath(workspaceId, `${base}?item=${r.itemId}${extra}`) };
  }

  const item = await db.query.contentItem.findFirst({ where: (c, { and, eq, isNull }) => and(eq(c.id, sp.item!), eq(c.workspaceId, workspaceId), isNull(c.deletedAt)) });
  if (!item) return { kind: "redirect", to: workspacePath(workspaceId, "calendar") };
  if (["publishing", "published", "partially_published"].includes(item.status)) return { kind: "redirect", to: workspacePath(workspaceId, `posts/${item.id}`) };
  const variants = await db.select().from(postVariant).where(eq(postVariant.contentItemId, item.id));
  const assets = await loadAssets(workspaceId);

  const channelRows: ComposerChannel[] = channels.map((c) => ({ id: c.id, provider: c.provider, network: c.network, kind: c.kind, name: c.name, handle: c.handle, avatarUrl: c.avatarUrl, status: c.status, formats: c.capabilities.formats, textMax: c.capabilities.limits.textMaxChars ?? null, firstComment: Boolean(c.capabilities.limits.firstComment), links: c.capabilities.limits.links ?? "inline" }));
  const initial: ComposerItem = {
    id: item.id, title: item.title, status: item.status, approvalState: item.approvalState,
    sharedText: item.sharedText || (sp.text ?? ""),
    sharedAssetIds: sp.asset && item.sharedAssetIds.length === 0 && assets.some((a) => a.id === sp.asset) ? [sp.asset] : item.sharedAssetIds,
    link: item.link,
    scheduledAtLocal: item.scheduledAt ? utcToZonedInput(item.scheduledAt, ctx.workspace.timezone) : null,
    channelIds: variants.map((v) => v.channelId),
    variants: Object.fromEntries(variants.map((v) => [v.channelId, { format: v.format, textOverride: v.textOverride, assetIdsOverride: v.assetIdsOverride, firstComment: v.firstComment, linkOverride: v.linkOverride, validation: v.validation?.issues ?? [] }])),
  };

  const [approval, reviewerRows, templates, ws] = await Promise.all([approvalRequirement(workspaceId, item.id), reviewerOptions(workspaceId), listTemplates(workspaceId), db.select({ settings: workspaceTable.settings }).from(workspaceTable).where(eq(workspaceTable.id, workspaceId))]);
  const t = readTracking(ws[0]?.settings ?? {});
  const names = reviewerRows.length ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, reviewerRows.map((r) => r.userId))) : [];
  const reviewers = reviewerRows.filter((r) => r.userId !== ctx.session.user.id).map((r) => ({ userId: r.userId, name: names.find((n) => n.id === r.userId)?.name ?? "Member", role: r.role }));
  const canPublish = hasCapability(ctx.workspace, "content.publish") || ctx.workspace.role === "creator";
  const tracking = { source: t.utmSource, medium: t.utmMedium, campaign: t.utmCampaign };
  return { kind: "ready", props: { workspaceId, timezone: ctx.workspace.timezone, item: initial, channels: channelRows, assets, canPublish, approval, reviewers, templates, tracking } };
}

async function loadAssets(workspaceId: string): Promise<ComposerAsset[]> {
  const rows = await db.select().from(asset).where(and(eq(asset.workspaceId, workspaceId), isNull(asset.deletedAt), eq(asset.uploadStatus, "ready"), inArray(asset.kind, ["image", "video"]))).orderBy(desc(asset.createdAt)).limit(200);
  const rends = rows.length ? await db.select().from(assetRendition).where(and(inArray(assetRendition.assetId, rows.map((a) => a.id)), eq(assetRendition.kind, "thumb"))) : [];
  return Promise.all(
    rows.map(async (a) => {
      const t = rends.find((r) => r.assetId === a.id);
      return { id: a.id, kind: a.kind as "image" | "video", fileName: a.fileName, altText: a.altText, thumbUrl: t ? await presignGet(t.storageKey) : a.kind === "image" ? await presignGet(a.storageKey) : null, previewUrl: a.kind === "video" ? await presignGet(a.storageKey) : null, scanClean: a.scanStatus === "clean", width: a.width, height: a.height };
    }),
  );
}
