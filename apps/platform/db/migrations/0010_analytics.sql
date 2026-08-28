CREATE TABLE "metric_fact" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"entity" text NOT NULL,
	"remote_id" text DEFAULT '' NOT NULL,
	"metric" text NOT NULL,
	"day" text NOT NULL,
	"value" numeric(18, 2) NOT NULL,
	"scope" text DEFAULT 'organic' NOT NULL,
	"source" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"fresh_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_definition" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"rolling_days" integer,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cadence" text DEFAULT 'none' NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"format" text DEFAULT 'csv' NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_run" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"definition_id" text,
	"name" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"format" text DEFAULT 'csv' NOT NULL,
	"object_key" text,
	"size_bytes" integer,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"requested_by_user_id" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metric_fact" ADD CONSTRAINT "metric_fact_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_fact" ADD CONSTRAINT "metric_fact_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_fact" ADD CONSTRAINT "metric_fact_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_definition" ADD CONSTRAINT "report_definition_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_definition" ADD CONSTRAINT "report_definition_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_definition" ADD CONSTRAINT "report_definition_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_run" ADD CONSTRAINT "report_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_run" ADD CONSTRAINT "report_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_run" ADD CONSTRAINT "report_run_definition_id_report_definition_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."report_definition"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_run" ADD CONSTRAINT "report_run_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_fact_grain_idx" ON "metric_fact" USING btree ("channel_id","entity","remote_id","metric","day","scope");--> statement-breakpoint
CREATE INDEX "metric_fact_ws_day_idx" ON "metric_fact" USING btree ("workspace_id","day","metric");--> statement-breakpoint
CREATE INDEX "metric_fact_post_idx" ON "metric_fact" USING btree ("workspace_id","entity","remote_id");--> statement-breakpoint
CREATE INDEX "report_definition_ws_idx" ON "report_definition" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "report_definition_due_idx" ON "report_definition" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "report_run_ws_idx" ON "report_run" USING btree ("workspace_id","created_at");