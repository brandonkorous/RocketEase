/*
 * Campaigns & paid (data-model.md "Paid and analytics", CAM-001/CAM-002).
 * A campaign groups organic content (campaign_content) and imported paid
 * objects (ad_campaign → ad_set → ad_creative). `promotion` is the audited,
 * confirmed intent to spend; the worker creates the remote objects for it.
 */
import { sql } from "drizzle-orm";
import { index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { AdAccountStatus, PaidObjectStatus, PromotionRequest } from "@make-it-social/providers";
import { organization, user } from "./auth";
import { workspace } from "./app";
import { channel, providerConnection, providerKey } from "./connections";
import { contentItem, postVariant } from "./content";

const id = (name = "id") => text(name).primaryKey().default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
const scoped = () => ({
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
});

export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const campaignStatus = pgEnum("campaign_status", CAMPAIGN_STATUSES);
export const CAMPAIGN_OBJECTIVES = ["awareness", "engagement", "traffic", "leads", "conversions"] as const;
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

export type CampaignTracking = { utmSource?: string; utmMedium?: string; utmCampaign?: string; linkTemplate?: string };

export const campaign = pgTable(
  "campaign",
  {
    id: id(),
    ...scoped(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    objective: text("objective").$type<CampaignObjective>().notNull().default("engagement"),
    status: campaignStatus("status").notNull().default("draft"),
    startAt: ts("start_at"),
    endAt: ts("end_at"),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    /** Optional planned budget; spend is always imported, never typed in. */
    budgetAmount: money("budget_amount"),
    currency: text("currency").notNull().default("USD"),
    tracking: jsonb("tracking").$type<CampaignTracking>().notNull().default({}),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    archivedAt: ts("archived_at"),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("campaign_ws_status_idx").on(t.workspaceId, t.status, t.startAt), index("campaign_ws_name_idx").on(t.workspaceId, t.name)],
);

export const campaignContent = pgTable(
  "campaign_content",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").notNull().references(() => campaign.id, { onDelete: "cascade" }),
    contentItemId: text("content_item_id").notNull().references(() => contentItem.id, { onDelete: "cascade" }),
    addedByUserId: text("added_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
  },
  (t) => [uniqueIndex("campaign_content_pair_idx").on(t.campaignId, t.contentItemId), index("campaign_content_item_idx").on(t.contentItemId)],
);

export const adAccount = pgTable(
  "ad_account",
  {
    id: id(),
    ...scoped(),
    connectionId: text("connection_id").notNull().references(() => providerConnection.id, { onDelete: "cascade" }),
    /** Channel whose metric_fact rows carry this account's paid facts (Page for Meta). */
    channelId: text("channel_id").references(() => channel.id, { onDelete: "set null" }),
    provider: providerKey("provider").notNull(),
    remoteId: text("remote_id").notNull(),
    name: text("name").notNull(),
    currency: text("currency").notNull(),
    timezone: text("timezone"),
    status: text("status").$type<AdAccountStatus>().notNull().default("unknown"),
    managerUrl: text("manager_url"),
    lastSyncAt: ts("last_sync_at"),
    lastError: text("last_error"),
    connectedByUserId: text("connected_by_user_id").references(() => user.id, { onDelete: "set null" }),
    disconnectedAt: ts("disconnected_at"),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [uniqueIndex("ad_account_ws_remote_idx").on(t.workspaceId, t.provider, t.remoteId)],
);

export const PROMOTION_STATUSES = ["queued", "creating", "ambiguous", "created", "failed"] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];
export const promotionStatus = pgEnum("promotion_status", PROMOTION_STATUSES);

/** A confirmed intent to spend. Created only after the user approved the summary (CAM-002). */
export const promotion = pgTable(
  "promotion",
  {
    id: id(),
    ...scoped(),
    campaignId: text("campaign_id").references(() => campaign.id, { onDelete: "set null" }),
    variantId: text("variant_id").notNull().references(() => postVariant.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull().references(() => channel.id, { onDelete: "cascade" }),
    adAccountId: text("ad_account_id").notNull().references(() => adAccount.id, { onDelete: "cascade" }),
    status: promotionStatus("status").notNull().default("queued"),
    /** Stable across retries; adapters must never create a second set of remote objects for it. */
    idempotencyKey: text("idempotency_key").notNull(),
    request: jsonb("request").$type<Omit<PromotionRequest, "idempotencyKey">>().notNull(),
    confirmedByUserId: text("confirmed_by_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    confirmedAt: now("confirmed_at"),
    campaignRemoteId: text("campaign_remote_id"),
    adSetRemoteId: text("ad_set_remote_id"),
    adRemoteId: text("ad_remote_id"),
    managerUrl: text("manager_url"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [uniqueIndex("promotion_idempotency_idx").on(t.idempotencyKey), index("promotion_ws_idx").on(t.workspaceId, t.createdAt), index("promotion_campaign_idx").on(t.campaignId)],
);

export const adCampaign = pgTable(
  "ad_campaign",
  {
    id: id(),
    ...scoped(),
    adAccountId: text("ad_account_id").notNull().references(() => adAccount.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").references(() => campaign.id, { onDelete: "set null" }),
    promotionId: text("promotion_id").references(() => promotion.id, { onDelete: "set null" }),
    remoteId: text("remote_id").notNull(),
    name: text("name").notNull(),
    objective: text("objective"),
    status: text("status").$type<PaidObjectStatus>().notNull().default("unknown"),
    dailyBudget: money("daily_budget"),
    lifetimeBudget: money("lifetime_budget"),
    currency: text("currency").notNull(),
    startAt: ts("start_at"),
    endAt: ts("end_at"),
    managerUrl: text("manager_url"),
    lastSeenAt: now("last_seen_at"),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [uniqueIndex("ad_campaign_account_remote_idx").on(t.adAccountId, t.remoteId), index("ad_campaign_campaign_idx").on(t.campaignId), index("ad_campaign_ws_idx").on(t.workspaceId, t.status)],
);

export const adSet = pgTable(
  "ad_set",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    adCampaignId: text("ad_campaign_id").notNull().references(() => adCampaign.id, { onDelete: "cascade" }),
    remoteId: text("remote_id").notNull(),
    name: text("name").notNull(),
    status: text("status").$type<PaidObjectStatus>().notNull().default("unknown"),
    dailyBudget: money("daily_budget"),
    lifetimeBudget: money("lifetime_budget"),
    targetingSummary: text("targeting_summary"),
    startAt: ts("start_at"),
    endAt: ts("end_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [uniqueIndex("ad_set_campaign_remote_idx").on(t.adCampaignId, t.remoteId)],
);

export const adCreative = pgTable(
  "ad_creative",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    adCampaignId: text("ad_campaign_id").notNull().references(() => adCampaign.id, { onDelete: "cascade" }),
    adSetId: text("ad_set_id").references(() => adSet.id, { onDelete: "set null" }),
    remoteId: text("remote_id").notNull(),
    name: text("name").notNull(),
    status: text("status").$type<PaidObjectStatus>().notNull().default("unknown"),
    promotedPostRemoteId: text("promoted_post_remote_id"),
    /** Set when the ad originated from one of our promotions. */
    promotedVariantId: text("promoted_variant_id").references(() => postVariant.id, { onDelete: "set null" }),
    previewUrl: text("preview_url"),
    thumbnailUrl: text("thumbnail_url"),
    updatedAt: now("updated_at"),
  },
  (t) => [uniqueIndex("ad_creative_campaign_remote_idx").on(t.adCampaignId, t.remoteId), index("ad_creative_post_idx").on(t.promotedPostRemoteId)],
);

/** Append-only history: created, updated, status, content_attached, content_detached, ad_account_connected, promotion_*, ad_campaign_status. */
export const campaignEvent = pgTable(
  "campaign_event",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").notNull().references(() => campaign.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now("created_at"),
  },
  (t) => [index("campaign_event_campaign_idx").on(t.campaignId, t.createdAt)],
);

export type Campaign = typeof campaign.$inferSelect;
export type AdAccount = typeof adAccount.$inferSelect;
export type AdCampaign = typeof adCampaign.$inferSelect;
export type Promotion = typeof promotion.$inferSelect;
