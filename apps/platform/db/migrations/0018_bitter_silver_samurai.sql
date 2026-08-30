ALTER TYPE "public"."asset_kind" ADD VALUE 'audio';--> statement-breakpoint
CREATE TABLE "media_job" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"job_kind" text NOT NULL,
	"adapter" text NOT NULL,
	"model_key" text NOT NULL,
	"vendor_model_id" text NOT NULL,
	"model_reason" text,
	"spec" jsonb NOT NULL,
	"seed" integer,
	"idempotency_key" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"remote_job_id" text,
	"output_expires_at" timestamp with time zone,
	"quantity" numeric(14, 4),
	"unit" text,
	"vendor_cost_usd" numeric(12, 6),
	"asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_category" text,
	"error_note" text,
	"mismatches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requested_by_user_id" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "media_job_id" text;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "derived_from_asset_id" text;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "provenance" jsonb;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "license_source" text DEFAULT 'owned' NOT NULL;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "platform_clearance" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "media_job" ADD CONSTRAINT "media_job_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_job" ADD CONSTRAINT "media_job_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_job" ADD CONSTRAINT "media_job_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_job_ws_idempotency_idx" ON "media_job" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "media_job_ws_created_idx" ON "media_job" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "media_job_state_updated_idx" ON "media_job" USING btree ("state","updated_at");