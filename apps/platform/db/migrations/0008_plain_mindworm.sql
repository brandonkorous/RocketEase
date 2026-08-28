CREATE TYPE "public"."approval_decision_kind" AS ENUM('approved', 'changes_requested', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."approval_request_state" AS ENUM('pending', 'approved', 'changes_requested', 'rejected', 'superseded', 'canceled');--> statement-breakpoint
CREATE TABLE "approval_decision" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" text NOT NULL,
	"version_id" text NOT NULL,
	"decided_by_user_id" text,
	"decision" "approval_decision_kind" NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_policy" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approver_roles" jsonb DEFAULT '["owner","admin","manager"]'::jsonb NOT NULL,
	"approver_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"separation_of_duty" boolean DEFAULT true NOT NULL,
	"due_hours" integer DEFAULT 24 NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_request" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"content_item_id" text NOT NULL,
	"version_id" text NOT NULL,
	"policy_id" text,
	"requested_by_user_id" text,
	"assignee_user_id" text,
	"approver_roles" jsonb DEFAULT '["owner","admin","manager"]'::jsonb NOT NULL,
	"separation_of_duty" boolean DEFAULT true NOT NULL,
	"state" "approval_request_state" DEFAULT 'pending' NOT NULL,
	"due_at" timestamp with time zone,
	"schedule_on_approve" text,
	"note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"content_item_id" text NOT NULL,
	"version_id" text,
	"field" text,
	"asset_id" text,
	"parent_id" text,
	"author_user_id" text,
	"body" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "approval_decision" ADD CONSTRAINT "approval_decision_request_id_approval_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."approval_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decision" ADD CONSTRAINT "approval_decision_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policy" ADD CONSTRAINT "approval_policy_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policy" ADD CONSTRAINT "approval_policy_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policy" ADD CONSTRAINT "approval_policy_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_version_id_content_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."content_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_policy_id_approval_policy_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."approval_policy"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_decision_request_idx" ON "approval_decision" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "approval_policy_ws_idx" ON "approval_policy" USING btree ("workspace_id","enabled");--> statement-breakpoint
CREATE INDEX "approval_request_ws_state_idx" ON "approval_request" USING btree ("workspace_id","state","due_at");--> statement-breakpoint
CREATE INDEX "approval_request_item_idx" ON "approval_request" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "comment_item_idx" ON "comment" USING btree ("content_item_id","created_at");