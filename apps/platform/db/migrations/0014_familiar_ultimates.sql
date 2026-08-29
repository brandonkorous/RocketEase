CREATE TYPE "public"."recycle_outcome" AS ENUM('created', 'scheduled', 'skipped', 'failed');--> statement-breakpoint
ALTER TYPE "public"."provider_key" ADD VALUE 'google_business';--> statement-breakpoint
ALTER TYPE "public"."message_delivery_state" ADD VALUE 'draft' BEFORE 'received';--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" text,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hashtag_set" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"channel_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recycle_rule" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"tag_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"channel_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"every_days" integer DEFAULT 30 NOT NULL,
	"at_time" text DEFAULT '09:00' NOT NULL,
	"max_repeats_per_item" integer DEFAULT 3 NOT NULL,
	"pause_until" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recycle_run" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"occurrence" text NOT NULL,
	"occurrence_key" text NOT NULL,
	"source_item_id" text,
	"new_item_id" text,
	"outcome" "recycle_outcome" DEFAULT 'created' NOT NULL,
	"reason" text,
	"scheduled_for" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authorization_grant" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"scope" text DEFAULT 'both' NOT NULL,
	"label" text NOT NULL,
	"asset_id" text,
	"channel_id" text,
	"creator_handle" text,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"reference" text,
	"note" text,
	"created_by_user_id" text,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "rights_scope" text DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "synthetic_media" jsonb;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "recycled_from_item_id" text;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "import_note" text;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "api_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "post_variant" ADD COLUMN "disclosure" jsonb;--> statement-breakpoint
ALTER TABLE "publish_job" ADD COLUMN "reconciled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hashtag_set" ADD CONSTRAINT "hashtag_set_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hashtag_set" ADD CONSTRAINT "hashtag_set_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hashtag_set" ADD CONSTRAINT "hashtag_set_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recycle_rule" ADD CONSTRAINT "recycle_rule_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recycle_rule" ADD CONSTRAINT "recycle_rule_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recycle_rule" ADD CONSTRAINT "recycle_rule_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recycle_run" ADD CONSTRAINT "recycle_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recycle_run" ADD CONSTRAINT "recycle_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recycle_run" ADD CONSTRAINT "recycle_run_rule_id_recycle_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."recycle_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_grant" ADD CONSTRAINT "authorization_grant_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_grant" ADD CONSTRAINT "authorization_grant_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_grant" ADD CONSTRAINT "authorization_grant_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_grant" ADD CONSTRAINT "authorization_grant_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_grant" ADD CONSTRAINT "authorization_grant_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_grant" ADD CONSTRAINT "authorization_grant_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_hash_idx" ON "api_key" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_key_ws_idx" ON "api_key" USING btree ("workspace_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hashtag_set_ws_name_idx" ON "hashtag_set" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "hashtag_set_ws_idx" ON "hashtag_set" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "recycle_rule_ws_enabled_idx" ON "recycle_rule" USING btree ("workspace_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "recycle_run_rule_occurrence_idx" ON "recycle_run" USING btree ("rule_id","occurrence");--> statement-breakpoint
CREATE UNIQUE INDEX "recycle_run_key_idx" ON "recycle_run" USING btree ("occurrence_key");--> statement-breakpoint
CREATE INDEX "recycle_run_ws_created_idx" ON "recycle_run" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "authorization_grant_ws_expiry_idx" ON "authorization_grant" USING btree ("workspace_id","expires_at");--> statement-breakpoint
CREATE INDEX "authorization_grant_asset_idx" ON "authorization_grant" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "authorization_grant_channel_idx" ON "authorization_grant" USING btree ("channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_item_ws_api_idem_idx" ON "content_item" USING btree ("workspace_id","api_idempotency_key");