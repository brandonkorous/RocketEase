/*
 * Voices, likenesses, and the consent that makes them usable (M12.3).
 *
 * The finding this table exists for: every vendor's "consent" check verifies the
 * UPLOADER, not the owner of the voice. ElevenLabs' voice captcha proves the
 * person recording it is the person speaking. In an agency those are never the
 * same person — an employee cloning a client's founder passes the captcha and
 * has no consent at all (docs/research/ai-media-2026.md §8).
 *
 * So the consent record has to be OURS: a named person, evidence, an authoriser,
 * a scope, and an expiry. A cloned voice or likeness without a complete,
 * unexpired record is unusable — enforced in lib/media/voice/policy.ts, not here.
 */
import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";
import { asset } from "./assets";

const id = (name = "id") =>
  text(name)
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

/** `stock` needs no consent. `cloned` and `likeness` are unusable without it. */
export const VOICE_KINDS = ["stock", "cloned", "likeness"] as const;
export type VoiceKind = (typeof VOICE_KINDS)[number];

/** Matches `asset.rights_scope`: an organic-only consent cannot carry a paid ad. */
export const CONSENT_SCOPES = ["organic", "paid", "both"] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export const voice = pgTable(
  "voice",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    kind: text("kind").$type<VoiceKind>().notNull().default("stock"),
    adapter: text("adapter").notNull(),
    /** The vendor's own identifier. Never a credential. */
    remoteVoiceId: text("remote_voice_id").notNull(),
    language: text("language"),
    note: text("note"),

    /* --- the consent block. All null for a stock voice, all required otherwise. --- */
    /** Whose voice or likeness this is. A real person, named. */
    consentPersonName: text("consent_person_name"),
    /** The signed release, recording, or email — held in the library, not described. */
    consentEvidenceAssetId: text("consent_evidence_asset_id").references(() => asset.id, { onDelete: "set null" }),
    /** Who in OUR product asserted the consent exists. Owner-level, audited. */
    authorisedByUserId: text("authorised_by_user_id").references(() => user.id, { onDelete: "set null" }),
    authorisedAt: timestamp("authorised_at", { withTimezone: true }),
    /** Consent without an end date is not consent we will rely on. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scope: text("scope").$type<ConsentScope>().notNull().default("organic"),
    /** Set when consent is withdrawn. A withdrawal is never a delete — it is a record. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),

    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    index("voice_ws_idx").on(t.workspaceId, t.kind),
    uniqueIndex("voice_ws_remote_idx").on(t.workspaceId, t.adapter, t.remoteVoiceId),
  ],
);

export const CAPTION_SOURCES = ["generated", "uploaded", "edited"] as const;
export type CaptionSource = (typeof CAPTION_SOURCES)[number];

/** One word with its timing. The unit social captions are actually built from. */
export type CaptionWord = { text: string; startMs: number; endMs: number; speaker?: string };

export const captionTrack = pgTable(
  "caption_track",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    assetId: text("asset_id").notNull().references(() => asset.id, { onDelete: "cascade" }),
    /** BCP-47. Stored as given; never inferred from the workspace. */
    language: text("language").notNull().default("en"),
    source: text("source").$type<CaptionSource>().notNull().default("generated"),
    /**
     * Word-level timings — the thing that separates a usable social caption from
     * a paragraph. Cue grouping is derived from these, never stored separately,
     * so an edit to the words cannot leave stale cues behind.
     */
    words: jsonb("words").$type<CaptionWord[]>().notNull().default([]),
    /** The plain transcript. Kept for search and for editing without timings. */
    text: text("text").notNull().default(""),
    /** The job that produced it, when a model did. Null for an upload. */
    mediaJobId: text("media_job_id"),
    /** 0–1 as the vendor reported it. Null is honest; 0 would mean "certainly wrong". */
    confidence: real("confidence"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [uniqueIndex("caption_track_asset_lang_idx").on(t.assetId, t.language)],
);

export type Voice = typeof voice.$inferSelect;
export type CaptionTrack = typeof captionTrack.$inferSelect;
