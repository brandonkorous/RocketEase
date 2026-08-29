/*
 * Content library (content-model.md "Assets", requirements LIB-001/002).
 * Originals and renditions live in object storage; rows hold metadata,
 * rights, scan status, and accessibility text. Deletion is soft.
 */
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";

const id = (name = "id") =>
  text(name)
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const ASSET_KINDS = ["image", "video", "document"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const assetKind = pgEnum("asset_kind", ASSET_KINDS);

export const UPLOAD_STATUSES = ["pending", "processing", "ready", "failed"] as const;
export const uploadStatus = pgEnum("upload_status", UPLOAD_STATUSES);

export const RIGHTS_SCOPES = ["organic", "paid", "both"] as const;
/** What a licence covers. Organic rights rarely include paid (trends-2026 §4). */
export type RightsScope = (typeof RIGHTS_SCOPES)[number];

export const SCAN_STATUSES = ["pending", "clean", "infected", "error"] as const;
export const scanStatus = pgEnum("scan_status", SCAN_STATUSES);

export const folder = pgTable(
  "folder",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    createdAt: now("created_at"),
  },
  (t) => [index("folder_ws_idx").on(t.workspaceId, t.parentId)],
);

export const tag = pgTable(
  "tag",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: now("created_at"),
  },
  (t) => [uniqueIndex("tag_ws_name_idx").on(t.workspaceId, t.name)],
);

export const asset = pgTable(
  "asset",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    folderId: text("folder_id").references(() => folder.id, { onDelete: "set null" }),
    kind: assetKind("kind").notNull(),
    /** Object key of the original in STORAGE_BUCKET. */
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    bytes: integer("bytes"),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: integer("duration_seconds"),
    checksumSha256: text("checksum_sha256"),
    title: text("title"),
    altText: text("alt_text"),
    caption: text("caption"),
    tagIds: jsonb("tag_ids").$type<string[]>().notNull().default([]),
    /** Rights/licensing (LIB-002). Publishing is blocked after expiry. */
    rightsNote: text("rights_note"),
    rightsExpiresAt: timestamp("rights_expires_at", { withTimezone: true }),
    /** Whether the licence covers organic posting, paid usage, or both. */
    rightsScope: text("rights_scope").$type<RightsScope>().notNull().default("both"),
    /** Made by an image model rather than captured. Drives the synthetic-media disclosure suggestion. */
    generatedByAi: boolean("generated_by_ai").notNull().default(false),
    generationModel: text("generation_model"),
    uploadStatus: uploadStatus("upload_status").notNull().default("pending"),
    scanStatus: scanStatus("scan_status").notNull().default("pending"),
    scanNote: text("scan_note"),
    processingError: text("processing_error"),
    uploadedByUserId: text("uploaded_by_user_id").references(() => user.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    index("asset_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("asset_ws_kind_idx").on(t.workspaceId, t.kind),
    uniqueIndex("asset_storage_key_idx").on(t.storageKey),
  ],
);

export const RENDITION_KINDS = ["thumb", "preview", "web", "poster"] as const;
export type RenditionKind = (typeof RENDITION_KINDS)[number];

export const assetRendition = pgTable(
  "asset_rendition",
  {
    id: id(),
    assetId: text("asset_id").notNull().references(() => asset.id, { onDelete: "cascade" }),
    kind: text("kind").$type<RenditionKind>().notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes"),
    createdAt: now("created_at"),
  },
  (t) => [uniqueIndex("asset_rendition_asset_kind_idx").on(t.assetId, t.kind)],
);

export type Asset = typeof asset.$inferSelect;
export type AssetRendition = typeof assetRendition.$inferSelect;
export type Folder = typeof folder.$inferSelect;
export type Tag = typeof tag.$inferSelect;
