/*
 * JSON shapes for /api/v1. Field names match the product vocabulary
 * (Channel, Content item, Post variant, Conversation) so an agent reading the
 * docs and an agent reading the API see the same nouns.
 */
import type { Channel } from "@/db/schema/connections";
import type { ContentItem, PostVariant } from "@/db/schema/content";
import type { ValidationIssue } from "@rocketease/providers";
import { channelCapabilityItems } from "@/lib/capabilities";
import type { PublishReceipt } from "@/lib/publishing/receipt";

export function channelView(ch: Channel) {
  return {
    id: ch.id,
    name: ch.name,
    handle: ch.handle,
    network: ch.network,
    provider: ch.provider,
    kind: ch.kind,
    status: ch.status,
    health: { tokenOk: ch.health.tokenOk, permissionsOk: ch.health.permissionsOk, message: ch.health.message ?? null },
    /** The channel's live capabilities, as stored at connect/sync time. */
    capabilities: ch.capabilities,
    /** The same truth as a flat list, each unsupported entry carrying the network's own reason. */
    capabilitySummary: channelCapabilityItems(ch.capabilities),
  };
}

export function variantView(v: PostVariant, channelName?: string) {
  return {
    id: v.id,
    channelId: v.channelId,
    channelName: channelName ?? null,
    format: v.format,
    status: v.status,
    scheduledAt: v.scheduledAt?.toISOString() ?? null,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    remoteId: v.remoteId,
    permalink: v.remoteUrl,
    attempts: v.attempts,
    lastError: v.lastError ? { category: v.lastError.category, message: v.lastError.message, ambiguous: Boolean(v.lastError.ambiguous) } : null,
    validation: v.validation?.issues ?? [],
  };
}

export function itemView(item: ContentItem, variants: PostVariant[], names: Map<string, string> = new Map()) {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    approvalState: item.approvalState,
    text: item.sharedText,
    assetIds: item.sharedAssetIds,
    link: item.link,
    scheduledAt: item.scheduledAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    variants: variants.map((v) => variantView(v, names.get(v.channelId))),
  };
}

/** Validation as the composer shows it: per channel, errors first. */
export function problemsView(problems: Record<string, ValidationIssue[]>) {
  return Object.entries(problems).map(([channelId, issues]) => ({
    channelId,
    blocking: issues.some((i) => i.severity === "error"),
    issues: issues.map((i) => ({ severity: i.severity, code: i.code, message: i.message, field: i.field })),
  }));
}

export function receiptView(r: PublishReceipt) {
  return {
    variantId: r.variantId,
    channelName: r.channelName,
    network: r.network,
    outcome: r.outcome,
    headline: r.headline,
    summary: r.summary,
    attempts: r.attempts,
    reconciled: r.reconciled,
    remoteId: r.remoteId,
    permalink: r.permalink,
    nextAction: r.nextAction,
    steps: r.steps.map((s) => ({ key: s.key, label: s.label, detail: s.detail ?? null, tone: s.tone, at: s.at ? s.at.toISOString() : null })),
  };
}
