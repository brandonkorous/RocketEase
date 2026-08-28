CREATE TYPE "public"."automation_approval_state" AS ENUM('pending', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."automation_run_status" AS ENUM('matched', 'skipped', 'awaiting_approval', 'applied', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."automation_trigger" AS ENUM('inbox.message_received', 'post.published', 'post.failed', 'approval.decided', 'campaign.budget_threshold');--> statement-breakpoint
ALTER TYPE "public"."provider_key" ADD VALUE 'youtube';--> statement-breakpoint
ALTER TYPE "public"."provider_key" ADD VALUE 'pinterest';--> statement-breakpoint
ALTER TYPE "public"."provider_key" ADD VALUE 'x';--> statement-breakpoint
CREATE TABLE "step_up_verification" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"method" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_approval" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"state" "automation_approval_state" DEFAULT 'pending' NOT NULL,
	"approver_roles" jsonb DEFAULT '["owner","admin","manager"]'::jsonb NOT NULL,
	"summary" text NOT NULL,
	"due_at" timestamp with time zone,
	"decided_by_user_id" text,
	"decided_at" timestamp with time zone,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rule" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"trigger" "automation_trigger" NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conditions" jsonb DEFAULT '{"match":"all","conditions":[]}'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"approver_roles" jsonb DEFAULT '["owner","admin","manager"]'::jsonb NOT NULL,
	"created_by_user_id" text,
	"last_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_run" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"trigger_type" "automation_trigger" NOT NULL,
	"trigger_ref_id" text NOT NULL,
	"status" "automation_run_status" DEFAULT 'matched' NOT NULL,
	"evaluation" jsonb NOT NULL,
	"actions_result" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approval_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "best_time_slot" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"weekday" integer NOT NULL,
	"hour" integer NOT NULL,
	"score" numeric(12, 6) NOT NULL,
	"sample_size" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"target" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"confidence" text DEFAULT 'low' NOT NULL,
	"action" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"channel_id" text,
	"content_item_id" text,
	"decided_by_user_id" text,
	"decided_at" timestamp with time zone,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "step_up_verification" ADD CONSTRAINT "step_up_verification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_approval" ADD CONSTRAINT "automation_approval_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_approval" ADD CONSTRAINT "automation_approval_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_approval" ADD CONSTRAINT "automation_approval_run_id_automation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."automation_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_approval" ADD CONSTRAINT "automation_approval_rule_id_automation_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_approval" ADD CONSTRAINT "automation_approval_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_rule_id_automation_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "best_time_slot" ADD CONSTRAINT "best_time_slot_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "best_time_slot" ADD CONSTRAINT "best_time_slot_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "best_time_slot" ADD CONSTRAINT "best_time_slot_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "step_up_session_idx" ON "step_up_verification" USING btree ("session_id","purpose","expires_at");--> statement-breakpoint
CREATE INDEX "automation_approval_ws_state_idx" ON "automation_approval" USING btree ("workspace_id","state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_approval_run_idx" ON "automation_approval" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "automation_rule_ws_trigger_idx" ON "automation_rule" USING btree ("workspace_id","trigger","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_run_rule_ref_idx" ON "automation_run" USING btree ("rule_id","trigger_ref_id");--> statement-breakpoint
CREATE INDEX "automation_run_rule_created_idx" ON "automation_run" USING btree ("rule_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_run_ws_status_idx" ON "automation_run" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "best_time_slot_key_idx" ON "best_time_slot" USING btree ("channel_id","weekday","hour");--> statement-breakpoint
CREATE INDEX "best_time_slot_ws_idx" ON "best_time_slot" USING btree ("workspace_id","channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_key_idx" ON "recommendation" USING btree ("workspace_id","kind","target");--> statement-breakpoint
CREATE INDEX "recommendation_ws_open_idx" ON "recommendation" USING btree ("workspace_id","status","expires_at");