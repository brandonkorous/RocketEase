/*
 * Authorisation clocks (trends-2026 §4). UGC licences, Spark codes,
 * partnership-ad permissions and music licences all expire, and organic
 * rights rarely include paid — so each grant carries its own scope + clock.
 * Publishing and promotion check them against the date the use happens.
 */
import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";
import { asset, RIGHTS_SCOPES, type RightsScope } from "./assets";
import { channel } from "./connections";

export { RIGHTS_SCOPES, type RightsScope };

export const GRANT_KINDS = ["ugc_license", "spark_code", "partnership_ad", "music_license", "other"] as const;
export type GrantKind = (typeof GRANT_KINDS)[number];

const id = (name = "id") =>
  text(name)
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * One authorisation with a clock. The subject is whichever of asset /
 * channel / creator handle the grant covers; at least one should be set,
 * otherwise the grant is informational only and gates nothing.
 */
export const authorizationGrant = pgTable(
  "authorization_grant",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    kind: text("kind").$type<GrantKind>().notNull().default("other"),
    /** What the grant allows: organic posting, paid usage, or both. */
    scope: text("scope").$type<RightsScope>().notNull().default("both"),
    /** Human label shown in messages ("Creator @mara · spring set"). */
    label: text("label").notNull(),
    assetId: text("asset_id").references(() => asset.id, { onDelete: "cascade" }),
    channelId: text("channel_id").references(() => channel.id, { onDelete: "cascade" }),
    creatorHandle: text("creator_handle"),
    startsAt: ts("starts_at"),
    expiresAt: ts("expires_at"),
    /** Spark code, licence number, contract URL — whatever proves the grant. */
    reference: text("reference"),
    note: text("note"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    revokedAt: ts("revoked_at"),
    revokedByUserId: text("revoked_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    index("authorization_grant_ws_expiry_idx").on(t.workspaceId, t.expiresAt),
    index("authorization_grant_asset_idx").on(t.assetId),
    index("authorization_grant_channel_idx").on(t.channelId),
  ],
);

export type AuthorizationGrant = typeof authorizationGrant.$inferSelect;
