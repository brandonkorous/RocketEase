/*
 * Shared content helpers used by actions, pages, and the worker.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { MediaInput, PublishFormat, ValidationIssue } from "@rocketease/providers";
import { db } from "@/db";
import { asset, assetRendition } from "@/db/schema/assets";
import { channel } from "@/db/schema/connections";
import { contentItem, postVariant, type ContentItem, type PostVariant, type VariantValidation } from "@/db/schema/content";
import { workspace } from "@/db/schema/app";
import { wasNotScanned } from "./assets/scan-note";
import { disclosureGap, readRequireAiDisclosure, toDisclosureInput } from "./disclosure";
import { credentialIssue } from "./media/credential";
import { getAdapter, toDescriptor } from "./providers";
import { grantsForUse, rightsAssets } from "./rights/queries";
import { rightsProblemsForPublish } from "./rights/rules";
import { presignGet } from "./storage";
import { isEnabled } from "./flags";

export const RULESET_VERSION = "2026-08-28.1";

/** Effective text/media/link for a variant after inheritance. */
export function resolveVariant(item: ContentItem, v: PostVariant) {
  return {
    text: v.textOverride ?? item.sharedText,
    assetIds: v.assetIdsOverride ?? item.sharedAssetIds,
    link: v.linkOverride ?? item.link ?? undefined,
    firstComment: v.firstComment ?? undefined,
  };
}

/** Pick a format from the media mix when the author hasn't forced one. */
export function inferFormat(assets: { kind: string }[], preferred?: PublishFormat): PublishFormat {
  if (preferred && preferred !== "text") return preferred;
  const images = assets.filter((a) => a.kind === "image").length;
  const videos = assets.filter((a) => a.kind === "video").length;
  if (videos === 1 && images === 0) return "video";
  if (images > 1) return "carousel";
  if (images === 1) return "image";
  return "text";
}

/** Build provider MediaInput[] with signed URLs (1h) from asset ids, preserving order. Only ready+clean assets. */
export async function mediaForAssets(assetIds: string[], opts: { forPublish?: boolean } = {}): Promise<{ media: MediaInput[]; problems: ValidationIssue[] }> {
  if (assetIds.length === 0) return { media: [], problems: [] };
  const rows = await db.select().from(asset).where(and(inArray(asset.id, assetIds), isNull(asset.deletedAt)));
  const rends = rows.length ? await db.select().from(assetRendition).where(inArray(assetRendition.assetId, rows.map((r) => r.id))) : [];
  const problems: ValidationIssue[] = [];
  const media: MediaInput[] = [];
  for (const id of assetIds) {
    const a = rows.find((r) => r.id === id);
    if (!a) {
      problems.push({ severity: "error", code: "asset_missing", message: "A selected asset was deleted.", field: "media" });
      continue;
    }
    if (a.uploadStatus !== "ready") problems.push({ severity: "error", code: "asset_not_ready", message: `${a.fileName} is still processing.`, field: "media" });
    if (a.scanStatus !== "clean") problems.push({ severity: "error", code: "asset_unscanned", message: `${a.fileName} hasn't passed the safety scan.`, field: "media" });
    // A `clean` nothing actually inspected must not read like a clean scan.
    else if (wasNotScanned(a.scanNote)) problems.push({ severity: "warning", code: "asset_not_scanned", message: `${a.fileName} was not virus-scanned — no scanner is configured for this deployment.`, field: "media" });
    // A credential our own pipeline removed is a disclosure we removed (Art. 50).
    const credential = credentialIssue(a);
    if (credential) problems.push({ ...credential, field: "media" });
    // Providers pull the "web" rendition when it exists (already oriented/compressed), else the original.
    const web = rends.find((r) => r.assetId === a.id && r.kind === "preview" && a.kind === "image");
    const key = opts.forPublish && web ? web.storageKey : a.storageKey;
    media.push({
      url: await presignGet(key, 3600),
      mimeType: opts.forPublish && web ? web.mimeType : a.mimeType,
      bytes: opts.forPublish && web ? (web.bytes ?? undefined) : (a.bytes ?? undefined),
      width: opts.forPublish && web ? (web.width ?? undefined) : (a.width ?? undefined),
      height: opts.forPublish && web ? (web.height ?? undefined) : (a.height ?? undefined),
      durationSeconds: a.durationSeconds ?? undefined,
      altText: a.altText ?? undefined,
    });
  }
  return { media, problems };
}

/** Rights and authorisation clocks must still be live when the post actually goes out (M8.4). */
async function publishRightsIssues(workspaceId: string, channelId: string, assetIds: string[], scheduledAt: Date | null): Promise<ValidationIssue[]> {
  const [assets, grants] = await Promise.all([rightsAssets(assetIds), grantsForUse(workspaceId, assetIds, channelId)]);
  return rightsProblemsForPublish({ channelId }, assets, grants, scheduledAt).map(({ severity, code, message, field }) => ({ severity, code, message, field }));
}

/** Validate one variant against its channel's live capabilities. Persists the result. */
export async function validateVariant(item: ContentItem, v: PostVariant): Promise<VariantValidation> {
  const ch = await db.query.channel.findFirst({ where: (c, { eq }) => eq(c.id, v.channelId) });
  const issues: ValidationIssue[] = [];
  if (!ch) issues.push({ severity: "error", code: "channel_missing", message: "This channel no longer exists.", field: "settings" });
  else {
    if (ch.status === "disconnected" || ch.status === "revoked") issues.push({ severity: "error", code: "channel_disconnected", message: `${ch.name} is disconnected. Reconnect it in Connected accounts.`, field: "settings" });
    else if (ch.status === "action_required") issues.push({ severity: "error", code: "channel_action_required", message: `${ch.name} needs to be reconnected (${ch.health.message ?? "permissions changed"}).`, field: "settings" });
    if (!isEnabled(`${ch.provider}.publish.${v.format}`)) issues.push({ severity: "error", code: "format_disabled", message: `${v.format} posts to ${ch.network} are temporarily disabled.`, field: "media" });
    const r = resolveVariant(item, v);
    const { media, problems } = await mediaForAssets(r.assetIds);
    issues.push(...problems);
    issues.push(...(await publishRightsIssues(item.workspaceId, ch.id, r.assetIds, v.scheduledAt)));
    try {
      const adapter = getAdapter(ch.provider);
      issues.push(...adapter.validate(toDescriptor(ch), { format: v.format, text: r.text, media, link: r.link, firstComment: r.firstComment, settings: v.settings, disclosure: toDisclosureInput(item.syntheticMedia) }));
      const gap = disclosureGap(ch.capabilities, item.syntheticMedia, { required: await requireAiDisclosure(item.workspaceId), channelName: ch.name });
      if (gap) issues.push({ ...gap, field: "settings" });
    } catch (e) {
      issues.push({ severity: "error", code: "provider_unavailable", message: e instanceof Error ? e.message : "Provider unavailable", field: "settings" });
    }
    if (v.scheduledAt && v.scheduledAt.getTime() < Date.now() - 60_000 && v.status === "draft")
      issues.push({ severity: "error", code: "schedule_in_past", message: "The scheduled time is in the past.", field: "schedule" });
  }
  const validation: VariantValidation = { issues, rulesetVersion: RULESET_VERSION, checkedAt: new Date().toISOString() };
  await db.update(postVariant).set({ validation, updatedAt: new Date() }).where(eq(postVariant.id, v.id));
  return validation;
}

/** workspace.settings.requireAiDisclosure, read once per validation pass. */
async function requireAiDisclosure(workspaceId: string): Promise<boolean> {
  const [ws] = await db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, workspaceId));
  return readRequireAiDisclosure(ws?.settings ?? {});
}

/** Summarize variant states into the item's status (content-model.md "variant state is authoritative"). */
export async function summarizeItem(itemId: string) {
  const vs = await db.select({ status: postVariant.status, scheduledAt: postVariant.scheduledAt }).from(postVariant).where(eq(postVariant.contentItemId, itemId));
  const item = await db.query.contentItem.findFirst({ where: (c, { eq }) => eq(c.id, itemId) });
  if (!item) return;
  const counts = Object.fromEntries(vs.map((v) => [v.status, 0])) as Record<string, number>;
  for (const v of vs) counts[v.status] = (counts[v.status] ?? 0) + 1;
  const n = vs.length;
  let status = item.status;
  if (n === 0) status = item.status === "canceled" ? "canceled" : "draft";
  else if (counts.publishing) status = "publishing";
  else if (counts.published === n) status = "published";
  else if (counts.published && (counts.failed || counts.canceled)) status = "partially_published";
  else if (counts.failed && !counts.scheduled && !counts.published) status = "failed";
  else if (counts.scheduled && !counts.published) status = "scheduled";
  else if (counts.canceled === n) status = "canceled";
  else if (counts.published && counts.scheduled) status = "scheduled";
  else if (["in_review", "changes_requested", "approved"].includes(item.status)) status = item.status;
  else status = "draft";
  const earliest = vs.map((v) => v.scheduledAt).filter((d): d is Date => Boolean(d)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  await db.update(contentItem).set({ status, scheduledAt: earliest, updatedAt: new Date() }).where(eq(contentItem.id, itemId));
}

/** Channels in a workspace that can currently accept posts. */
export async function publishableChannels(workspaceId: string) {
  return db.select().from(channel).where(and(eq(channel.workspaceId, workspaceId), inArray(channel.status, ["healthy", "degraded", "syncing", "action_required"])));
}
