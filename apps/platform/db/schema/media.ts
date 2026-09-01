/*
 * Media generation jobs (M12.1).
 *
 * The async spine the rest of the AI stack never needed: every completion in
 * lib/ai is a synchronous call inside a server action, and generation is a
 * minutes-long job with a vendor id.
 *
 * `vendor_cost_usd` is nullable and stays null when unknown — never a guessed
 * zero, the rule ai_usage.cost_usd already follows. Pricing is deferred, but
 * real cost accrues from the first render so it can be priced from measurement
 * rather than guesswork (docs/media-generation.md §9).
 */
import { sql } from "drizzle-orm";
import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { workspace } from "./app";

const id = (name = "id") =>
  text(name)
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const MEDIA_JOB_STATES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type MediaJobState = (typeof MEDIA_JOB_STATES)[number];

/** Terminal states never transition again; the poller skips them. */
export const isTerminalMediaState = (s: MediaJobState) => s === "succeeded" || s === "failed" || s === "cancelled";

export const mediaJob = pgTable(
  "media_job",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),

    /** The routing unit: `product_motion`, `hero_shot`, `voiceover`… (@rocketease/media JobKind). */
    jobKind: text("job_kind").notNull(),
    adapter: text("adapter").notNull(),
    /** Registry key — stable and ours, so a retired model still reads back. */
    modelKey: text("model_key").notNull(),
    /** The exact pinned vendor string that actually ran. */
    vendorModelId: text("vendor_model_id").notNull(),
    /** Why this model. Shown to the person; M8.2's "explain it" rule applied to spend. */
    modelReason: text("model_reason"),

    /** The request verbatim: replayable, auditable, diffable. */
    spec: jsonb("spec").$type<Record<string, unknown>>().notNull(),
    /** Stored where the model offers one, so "three more like this" is real. */
    seed: integer("seed"),

    /** Unique per workspace and NEVER bypassed — the no-double-spend guarantee. */
    idempotencyKey: text("idempotency_key").notNull(),
    state: text("state").$type<MediaJobState>().notNull().default("queued"),
    /** The vendor's own id, for reconciliation before any re-spend. */
    remoteJobId: text("remote_job_id"),
    /** Delivery URLs expire (Sora: 24h, measured); the poller races this. */
    outputExpiresAt: timestamp("output_expires_at", { withTimezone: true }),

    /** What was consumed, in the model's billed unit. */
    quantity: numeric("quantity", { precision: 14, scale: 4 }),
    unit: text("unit"),
    /**
     * What the vendor METERED. Azure bills gpt-image-2 per token, so these are
     * the reading and vendorCostUsd is arithmetic on top of a rate we configure.
     * Kept so a job can be re-priced when a rate turns out to be wrong.
     */
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    /** What it actually cost us. Null when unknown — never 0 as a stand-in. */
    vendorCostUsd: numeric("vendor_cost_usd", { precision: 12, scale: 6 }),
    /** What the CUSTOMER was billed, in the product's one unit (lib/ai/usage/credits.ts). */
    credits: numeric("credits", { precision: 12, scale: 4 }),

    assetIds: jsonb("asset_ids").$type<string[]>().notNull().default([]),
    /** User-facing reason, never the raw vendor payload. */
    errorCategory: text("error_category"),
    errorNote: text("error_note"),
    /** Where the vendor's claim and the probed file disagree. Kept, not hidden. */
    mismatches: jsonb("mismatches").$type<string[]>().notNull().default([]),

    requestedByUserId: text("requested_by_user_id").references(() => user.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    uniqueIndex("media_job_ws_idempotency_idx").on(t.workspaceId, t.idempotencyKey),
    index("media_job_ws_created_idx").on(t.workspaceId, t.createdAt),
    // The poller's working set: unfinished jobs, oldest first.
    index("media_job_state_updated_idx").on(t.state, t.updatedAt),
  ],
);

export type MediaJob = typeof mediaJob.$inferSelect;
