CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."promotion_status" AS ENUM('queued', 'creating', 'ambiguous', 'created', 'failed');--> statement-breakpoint
CREATE TABLE "ad_account" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"channel_id" text,
	"provider" "provider_key" NOT NULL,
	"remote_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"timezone" text,
	"status" text DEFAULT 'unknown' NOT NULL,
	"manager_url" text,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"connected_by_user_id" text,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_campaign" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"ad_account_id" text NOT NULL,
	"campaign_id" text,
	"promotion_id" text,
	"remote_id" text NOT NULL,
	"name" text NOT NULL,
	"objective" text,
	"status" text DEFAULT 'unknown' NOT NULL,
	"daily_budget" numeric(14, 2),
	"lifetime_budget" numeric(14, 2),
	"currency" text NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"manager_url" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_creative" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"ad_campaign_id" text NOT NULL,
	"ad_set_id" text,
	"remote_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"promoted_post_remote_id" text,
	"promoted_variant_id" text,
	"preview_url" text,
	"thumbnail_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_set" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"ad_campaign_id" text NOT NULL,
	"remote_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"daily_budget" numeric(14, 2),
	"lifetime_budget" numeric(14, 2),
	"targeting_summary" text,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"objective" text DEFAULT 'engagement' NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"owner_user_id" text,
	"budget_amount" numeric(14, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"tracking" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_content" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"content_item_id" text NOT NULL,
	"added_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_event" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor_user_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"campaign_id" text,
	"variant_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"ad_account_id" text NOT NULL,
	"status" "promotion_status" DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"request" jsonb NOT NULL,
	"confirmed_by_user_id" text NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"campaign_remote_id" text,
	"ad_set_remote_id" text,
	"ad_remote_id" text,
	"manager_url" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_template" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"shared_text" text DEFAULT '' NOT NULL,
	"shared_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"link" text,
	"tag_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_item_id" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_quality_issue" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"message" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product_event" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" text NOT NULL,
	"user_id" text,
	"organization_id" text,
	"workspace_id" text,
	"surface" text NOT NULL,
	"outcome" text DEFAULT 'ok' NOT NULL,
	"latency_ms" integer,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD COLUMN "notification_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_account" ADD CONSTRAINT "ad_account_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_account" ADD CONSTRAINT "ad_account_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_account" ADD CONSTRAINT "ad_account_connection_id_provider_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_account" ADD CONSTRAINT "ad_account_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_account" ADD CONSTRAINT "ad_account_connected_by_user_id_user_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign" ADD CONSTRAINT "ad_campaign_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign" ADD CONSTRAINT "ad_campaign_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign" ADD CONSTRAINT "ad_campaign_ad_account_id_ad_account_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign" ADD CONSTRAINT "ad_campaign_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign" ADD CONSTRAINT "ad_campaign_promotion_id_promotion_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creative" ADD CONSTRAINT "ad_creative_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creative" ADD CONSTRAINT "ad_creative_ad_campaign_id_ad_campaign_id_fk" FOREIGN KEY ("ad_campaign_id") REFERENCES "public"."ad_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creative" ADD CONSTRAINT "ad_creative_ad_set_id_ad_set_id_fk" FOREIGN KEY ("ad_set_id") REFERENCES "public"."ad_set"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creative" ADD CONSTRAINT "ad_creative_promoted_variant_id_post_variant_id_fk" FOREIGN KEY ("promoted_variant_id") REFERENCES "public"."post_variant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_set" ADD CONSTRAINT "ad_set_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_set" ADD CONSTRAINT "ad_set_ad_campaign_id_ad_campaign_id_fk" FOREIGN KEY ("ad_campaign_id") REFERENCES "public"."ad_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_content" ADD CONSTRAINT "campaign_content_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_content" ADD CONSTRAINT "campaign_content_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_content" ADD CONSTRAINT "campaign_content_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_content" ADD CONSTRAINT "campaign_content_added_by_user_id_user_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_event" ADD CONSTRAINT "campaign_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_event" ADD CONSTRAINT "campaign_event_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_event" ADD CONSTRAINT "campaign_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_variant_id_post_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."post_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_ad_account_id_ad_account_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_confirmed_by_user_id_user_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_template" ADD CONSTRAINT "content_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_template" ADD CONSTRAINT "content_template_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_template" ADD CONSTRAINT "content_template_source_item_id_content_item_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."content_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_template" ADD CONSTRAINT "content_template_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_issue" ADD CONSTRAINT "data_quality_issue_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_issue" ADD CONSTRAINT "data_quality_issue_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_account_ws_remote_idx" ON "ad_account" USING btree ("workspace_id","provider","remote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_campaign_account_remote_idx" ON "ad_campaign" USING btree ("ad_account_id","remote_id");--> statement-breakpoint
CREATE INDEX "ad_campaign_campaign_idx" ON "ad_campaign" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "ad_campaign_ws_idx" ON "ad_campaign" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_creative_campaign_remote_idx" ON "ad_creative" USING btree ("ad_campaign_id","remote_id");--> statement-breakpoint
CREATE INDEX "ad_creative_post_idx" ON "ad_creative" USING btree ("promoted_post_remote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_set_campaign_remote_idx" ON "ad_set" USING btree ("ad_campaign_id","remote_id");--> statement-breakpoint
CREATE INDEX "campaign_ws_status_idx" ON "campaign" USING btree ("workspace_id","status","start_at");--> statement-breakpoint
CREATE INDEX "campaign_ws_name_idx" ON "campaign" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_content_pair_idx" ON "campaign_content" USING btree ("campaign_id","content_item_id");--> statement-breakpoint
CREATE INDEX "campaign_content_item_idx" ON "campaign_content" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "campaign_event_campaign_idx" ON "campaign_event" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_idempotency_idx" ON "promotion" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "promotion_ws_idx" ON "promotion" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "promotion_campaign_idx" ON "promotion" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "content_template_ws_idx" ON "content_template" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "data_quality_issue_key_idx" ON "data_quality_issue" USING btree ("workspace_id","kind","subject");--> statement-breakpoint
CREATE INDEX "data_quality_issue_open_idx" ON "data_quality_issue" USING btree ("workspace_id","resolved_at");--> statement-breakpoint
CREATE INDEX "product_event_name_time_idx" ON "product_event" USING btree ("event","occurred_at");--> statement-breakpoint
CREATE INDEX "product_event_ws_idx" ON "product_event" USING btree ("workspace_id","occurred_at");