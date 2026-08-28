CREATE TYPE "public"."approval_state" AS ENUM('not_required', 'pending', 'approved', 'changes_requested', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('idea', 'draft', 'in_review', 'changes_requested', 'approved', 'scheduled', 'publishing', 'published', 'partially_published', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."publish_job_state" AS ENUM('queued', 'running', 'reconciling', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."variant_status" AS ENUM('draft', 'scheduled', 'publishing', 'published', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_item" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"campaign_id" text,
	"title" text DEFAULT 'Untitled post' NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"approval_state" "approval_state" DEFAULT 'not_required' NOT NULL,
	"shared_text" text DEFAULT '' NOT NULL,
	"shared_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"link" text,
	"tag_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scheduled_at" timestamp with time zone,
	"current_version_id" text,
	"owner_user_id" text,
	"created_by_user_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_version" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" text NOT NULL,
	"number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_variant" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"content_item_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"format" text DEFAULT 'text' NOT NULL,
	"text_override" text,
	"asset_ids_override" jsonb,
	"first_comment" text,
	"link_override" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"validation" jsonb,
	"status" "variant_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"remote_id" text,
	"remote_url" text,
	"last_error" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_job" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"version_id" text,
	"scheduled_for" timestamp with time zone NOT NULL,
	"state" "publish_job_state" DEFAULT 'queued' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"last_error" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remote_publication" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"remote_id" text NOT NULL,
	"url" text,
	"published_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'published' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_version" ADD CONSTRAINT "content_version_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_version" ADD CONSTRAINT "content_version_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_variant" ADD CONSTRAINT "post_variant_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_variant" ADD CONSTRAINT "post_variant_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_variant" ADD CONSTRAINT "post_variant_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_variant" ADD CONSTRAINT "post_variant_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_job" ADD CONSTRAINT "publish_job_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_job" ADD CONSTRAINT "publish_job_variant_id_post_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."post_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_publication" ADD CONSTRAINT "remote_publication_variant_id_post_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."post_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_publication" ADD CONSTRAINT "remote_publication_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_user_unread_idx" ON "notification" USING btree ("user_id","workspace_id","read_at");--> statement-breakpoint
CREATE INDEX "content_item_ws_status_idx" ON "content_item" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "content_item_ws_sched_idx" ON "content_item" USING btree ("workspace_id","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_version_item_number_idx" ON "content_version" USING btree ("content_item_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "post_variant_item_channel_idx" ON "post_variant" USING btree ("content_item_id","channel_id");--> statement-breakpoint
CREATE INDEX "post_variant_ws_sched_idx" ON "post_variant" USING btree ("workspace_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "post_variant_channel_status_idx" ON "post_variant" USING btree ("channel_id","status");--> statement-breakpoint
CREATE INDEX "publish_job_variant_idx" ON "publish_job" USING btree ("variant_id","state");--> statement-breakpoint
CREATE INDEX "publish_job_ws_sched_idx" ON "publish_job" USING btree ("workspace_id","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "remote_publication_channel_remote_idx" ON "remote_publication" USING btree ("channel_id","remote_id");