/*
 * Content model (docs/originals/content-model.md).
 *
 *   content_item  — reusable creative intent; state is a SUMMARY of variants
 *   post_variant  — per-channel rendition; state is authoritative
 *   content_version — immutable snapshots for approvals/history
 *   publish_job   — one execution attempt for one variant
 *   remote_publication — what the network says exists
 */
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";
import { channel } from "./connections";
import type { DisclosureEmission, PublishFormat, ValidationIssue } from "@rocketease/providers";

const id = (name = "id") =>
  text(name)
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const CONTENT_STATUSES = ["idea", "draft", "in_review", "changes_requested", "approved", "scheduled", "publishing", "published", "partially_published", "failed", "canceled"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export const contentStatus = pgEnum("content_status", CONTENT_STATUSES);

export const APPROVAL_STATES = ["not_required", "pending", "approved", "changes_requested", "superseded"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];
export const approvalState = pgEnum("approval_state", APPROVAL_STATES);

export const VARIANT_STATUSES = ["draft", "scheduled", "publishing", "published", "failed", "canceled"] as const;
export type VariantStatus = (typeof VARIANT_STATUSES)[number];
export const variantStatus = pgEnum("variant_status", VARIANT_STATUSES);

export const JOB_STATES = ["queued", "running", "reconciling", "succeeded", "failed", "canceled"] as const;
export const jobState = pgEnum("publish_job_state", JOB_STATES);

/** AI disclosure the author declared for the whole item (trends-2026.md §3, EU AI Act Art. 50). */
export const SYNTHETIC_FLAGS = ["none", "assisted", "synthetic_media"] as const;
export type SyntheticFlag = (typeof SYNTHETIC_FLAGS)[number];
export type SyntheticMedia = { flag: SyntheticFlag; note?: string; setBy: string | null; setAt: string };

export const contentItem = pgTable(
  "content_item",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id"),
    title: text("title").notNull().default("Untitled post"),
    status: contentStatus("status").notNull().default("draft"),
    approvalState: approvalState("approval_state").notNull().default("not_required"),
    /** Shared copy every variant inherits unless overridden. */
    sharedText: text("shared_text").notNull().default(""),
    /** Ordered asset ids shared by variants unless overridden. */
    sharedAssetIds: jsonb("shared_asset_ids").$type<string[]>().notNull().default([]),
    link: text("link"),
    tagIds: jsonb("tag_ids").$type<string[]>().notNull().default([]),
    /** null = never declared; the composer writes it the first time an author answers. */
    syntheticMedia: jsonb("synthetic_media").$type<SyntheticMedia>(),
    /**
     * The ad creative plan (M12.2). Deliberately UNTYPED here: the column can
     * hold a plan written by an older build, so every read goes through
     * lib/media/plan/schema.ts rather than trusting the shape.
     */
    adPlan: jsonb("ad_plan"),
    /** Earliest scheduled time across variants (for calendar/list summaries). */
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    currentVersionId: text("current_version_id"),
    /** Set when an evergreen recycle rule cloned this item from a published one (no FK: self-reference). */
    recycledFromItemId: text("recycled_from_item_id"),
    /** CSV import carries `media_urls` here as a note; remote media is never fetched. */
    importNote: text("import_note"),
    /** Idempotency-Key from the public API (docs/api.md); null for items created in the UI. */
    apiIdempotencyKey: text("api_idempotency_key"),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    index("content_item_ws_status_idx").on(t.workspaceId, t.status),
    index("content_item_ws_sched_idx").on(t.workspaceId, t.scheduledAt),
    uniqueIndex("content_item_ws_api_idem_idx").on(t.workspaceId, t.apiIdempotencyKey),
  ],
);

export type VariantValidation = { issues: ValidationIssue[]; rulesetVersion: string; checkedAt: string };
export type VariantError = { category: string; message: string; providerCode?: string; at: string; ambiguous?: boolean };

export const postVariant = pgTable(
  "post_variant",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    contentItemId: text("content_item_id").notNull().references(() => contentItem.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull().references(() => channel.id, { onDelete: "restrict" }),
    format: text("format").$type<PublishFormat>().notNull().default("text"),
    /** null = inherit sharedText. */
    textOverride: text("text_override"),
    /** null = inherit sharedAssetIds. */
    assetIdsOverride: jsonb("asset_ids_override").$type<string[]>(),
    firstComment: text("first_comment"),
    linkOverride: text("link_override"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    validation: jsonb("validation").$type<VariantValidation>(),
    status: variantStatus("status").notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    remoteId: text("remote_id"),
    remoteUrl: text("remote_url"),
    lastError: jsonb("last_error").$type<VariantError>(),
    /** What the adapter actually emitted for AI disclosure on this destination. */
    disclosure: jsonb("disclosure").$type<DisclosureEmission>(),
    attempts: integer("attempts").notNull().default(0),
    /** Stable across retries; adapters must never create a second remote object for it. */
    idempotencyKey: text("idempotency_key").notNull().default(sql`gen_random_uuid()`),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    uniqueIndex("post_variant_item_channel_idx").on(t.contentItemId, t.channelId),
    index("post_variant_ws_sched_idx").on(t.workspaceId, t.scheduledAt),
    index("post_variant_channel_status_idx").on(t.channelId, t.status),
  ],
);

export type VersionSnapshot = {
  title: string;
  sharedText: string;
  sharedAssetIds: string[];
  link: string | null;
  variants: { channelId: string; format: string; textOverride: string | null; assetIdsOverride: string[] | null; firstComment: string | null; linkOverride: string | null; settings: Record<string, unknown>; scheduledAt: string | null }[];
};

export const contentVersion = pgTable(
  "content_version",
  {
    id: id(),
    contentItemId: text("content_item_id").notNull().references(() => contentItem.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    snapshot: jsonb("snapshot").$type<VersionSnapshot>().notNull(),
    reason: text("reason").notNull(), // "schedule" | "approval_request" | "manual" | ...
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
  },
  (t) => [uniqueIndex("content_version_item_number_idx").on(t.contentItemId, t.number)],
);

export const publishJob = pgTable(
  "publish_job",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    variantId: text("variant_id").notNull().references(() => postVariant.id, { onDelete: "cascade" }),
    versionId: text("version_id"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    state: jobState("state").notNull().default("queued"),
    attempt: integer("attempt").notNull().default(1),
    lastError: jsonb("last_error").$type<VariantError>(),
    reconciled: boolean("reconciled").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: now("created_at"),
  },
  (t) => [index("publish_job_variant_idx").on(t.variantId, t.state), index("publish_job_ws_sched_idx").on(t.workspaceId, t.scheduledFor)],
);

export const remotePublication = pgTable(
  "remote_publication",
  {
    id: id(),
    variantId: text("variant_id").notNull().references(() => postVariant.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull().references(() => channel.id, { onDelete: "cascade" }),
    remoteId: text("remote_id").notNull(),
    url: text("url"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    /** published | deleted | unknown — reconciliation state, not authoring state */
    state: text("state").notNull().default("published"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: now("created_at"),
  },
  (t) => [uniqueIndex("remote_publication_channel_remote_idx").on(t.channelId, t.remoteId)],
);

export type TemplateVariant = { channelId: string; format: string; textOverride: string | null; assetIdsOverride: string[] | null; firstComment: string | null; linkOverride: string | null; settings: Record<string, unknown> };

/** Reusable post template (content-model.md "Templates and reuse"). Lineage: `sourceItemId` → template → audit `content.create_from_template`. */
export const contentTemplate = pgTable(
  "content_template",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sharedText: text("shared_text").notNull().default(""),
    sharedAssetIds: jsonb("shared_asset_ids").$type<string[]>().notNull().default([]),
    link: text("link"),
    tagIds: jsonb("tag_ids").$type<string[]>().notNull().default([]),
    variants: jsonb("variants").$type<TemplateVariant[]>().notNull().default([]),
    sourceItemId: text("source_item_id").references(() => contentItem.id, { onDelete: "set null" }),
    usageCount: integer("usage_count").notNull().default(0),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("content_template_ws_idx").on(t.workspaceId, t.name)],
);

export type ContentItem = typeof contentItem.$inferSelect;
export type ContentTemplate = typeof contentTemplate.$inferSelect;
export type PostVariant = typeof postVariant.$inferSelect;
export type PublishJobRow = typeof publishJob.$inferSelect;
