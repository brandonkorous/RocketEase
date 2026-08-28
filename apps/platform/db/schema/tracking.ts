/*
 * Conversion tracking sources (analytics.md "Campaign attribution" / "Traffic").
 * A tracking source is an outside system that reports what happened AFTER the
 * click — GA4 sessions/key events, Shopify orders, or a generic HMAC webhook.
 * `conversion_fact` is the daily grain, attributed by the UTM values the source
 * itself reports; we never re-model attribution on top of it.
 *
 * Credentials live in `secret` as the same AES-256-GCM envelope shape as
 * provider_connection.secret, bound to the row id (lib/tracking/sources.ts).
 */
import { sql } from "drizzle-orm";
import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";
import type { SecretEnvelope } from "./connections";

const id = (name = "id") => text(name).primaryKey().default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const scoped = () => ({
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
});

export const TRACKING_KINDS = ["ga4", "shopify", "webhook"] as const;
export type TrackingKind = (typeof TRACKING_KINDS)[number];

/** Mirrors integrations.md connection states, minus the ones only OAuth channels reach. */
export const TRACKING_STATUSES = ["connecting", "healthy", "action_required", "disconnected"] as const;
export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

export type TrackingConfig = {
  /** ga4: numeric GA4 property id (the number behind "properties/123456"). */
  propertyId?: string;
  /** shopify: myshopify.com domain. */
  shopDomain?: string;
  /** webhook: which conversion event name the sender uses, for display only. */
  eventName?: string;
  /** Attribution window the source itself applies, shown next to every number. */
  windowLabel?: string;
  /** Reporting currency as the source reports it; never converted. */
  currency?: string;
  /** Single-use OAuth nonce while status = connecting; cleared on callback. */
  oauthNonce?: string;
  oauthExpiresAt?: string;
};

export type TrackingHealth = {
  ok: boolean;
  message?: string;
  lastCheckedAt?: string;
  errorCategory?: string;
  /** Set once a sync has seen a non-zero revenue metric; gates ROAS. */
  hasRevenue?: boolean;
};

export const trackingSource = pgTable(
  "tracking_source",
  {
    id: id(),
    ...scoped(),
    kind: text("kind").$type<TrackingKind>().notNull(),
    name: text("name").notNull(),
    status: text("status").$type<TrackingStatus>().notNull().default("connecting"),
    config: jsonb("config").$type<TrackingConfig>().notNull().default({}),
    /** Encrypted credential JSON (OAuth token, or the webhook signing key). */
    secret: jsonb("secret").$type<SecretEnvelope>(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    health: jsonb("health").$type<TrackingHealth>().notNull().default({ ok: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("tracking_source_ws_idx").on(t.workspaceId, t.kind), index("tracking_source_status_idx").on(t.status)],
);

export const CONVERSION_METRICS = ["sessions", "conversions", "revenue"] as const;
export type ConversionMetric = (typeof CONVERSION_METRICS)[number];

/** What the source reported about the click that led here. Missing keys mean "not reported". */
export type ConversionDimension = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  /** Resolved at read time from utm_source → channel network; stored when unambiguous. */
  channelId?: string;
  /** Resolved from utm_campaign → campaign.tracking.utmCampaign. */
  campaignId?: string;
};

export const conversionFact = pgTable(
  "conversion_fact",
  {
    id: id(),
    ...scoped(),
    sourceId: text("source_id").notNull().references(() => trackingSource.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    metric: text("metric").$type<ConversionMetric>().notNull(),
    value: numeric("value", { precision: 18, scale: 2 }).notNull(),
    /** As reported; no conversion is ever applied (analytics.md). */
    currency: text("currency"),
    dimension: jsonb("dimension").$type<ConversionDimension>().notNull().default({}),
    /** Stable hash of the dimension so the grain can carry a unique index. */
    dimensionHash: text("dimension_hash").notNull(),
    source: text("source").notNull(),
    revision: integer("revision").notNull().default(1),
    freshAt: now("fresh_at"),
    createdAt: now("created_at"),
  },
  (t) => [
    uniqueIndex("conversion_fact_grain_idx").on(t.sourceId, t.day, t.metric, t.dimensionHash),
    index("conversion_fact_ws_day_idx").on(t.workspaceId, t.day, t.metric),
    index("conversion_fact_campaign_idx").on(t.workspaceId, t.day),
  ],
);

/*
 * Raw ledger for webhook sources only. GA4/Shopify are pulled and restated, so
 * their facts can be upserted directly; webhook events arrive one at a time and
 * must not double-count on a resend, so each is recorded under the sender's
 * event id and the day's fact is recomputed from this ledger.
 */
export const conversionEvent = pgTable(
  "conversion_event",
  {
    id: id(),
    ...scoped(),
    sourceId: text("source_id").notNull().references(() => trackingSource.id, { onDelete: "cascade" }),
    /** Sender-supplied id, else a hash of the raw body — the dedupe key. */
    eventId: text("event_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    day: text("day").notNull(),
    /** How many conversions this one event stands for (a CRM may post a daily roll-up). */
    count: integer("count").notNull().default(1),
    value: numeric("value", { precision: 18, scale: 2 }).notNull().default("0"),
    currency: text("currency"),
    dimension: jsonb("dimension").$type<ConversionDimension>().notNull().default({}),
    dimensionHash: text("dimension_hash").notNull(),
    receivedAt: now("received_at"),
  },
  (t) => [uniqueIndex("conversion_event_dedupe_idx").on(t.sourceId, t.eventId), index("conversion_event_day_idx").on(t.sourceId, t.day)],
);

export type TrackingSource = typeof trackingSource.$inferSelect;
export type ConversionFact = typeof conversionFact.$inferSelect;
export type ConversionEvent = typeof conversionEvent.$inferSelect;
