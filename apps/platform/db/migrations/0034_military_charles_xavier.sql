CREATE TABLE "listening_check" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"query_id" text NOT NULL,
	"network" text NOT NULL,
	"status" text NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"note" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listening_hit" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"query_id" text NOT NULL,
	"network" text NOT NULL,
	"remote_id" text NOT NULL,
	"term" text NOT NULL,
	"author" jsonb NOT NULL,
	"text" text NOT NULL,
	"url" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listening_query" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"networks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listening_check" ADD CONSTRAINT "listening_check_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_check" ADD CONSTRAINT "listening_check_query_id_listening_query_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."listening_query"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_hit" ADD CONSTRAINT "listening_hit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_hit" ADD CONSTRAINT "listening_hit_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_hit" ADD CONSTRAINT "listening_hit_query_id_listening_query_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."listening_query"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_query" ADD CONSTRAINT "listening_query_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_query" ADD CONSTRAINT "listening_query_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_query" ADD CONSTRAINT "listening_query_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listening_check_query_idx" ON "listening_check" USING btree ("query_id","checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "listening_hit_query_remote_idx" ON "listening_hit" USING btree ("query_id","network","remote_id");--> statement-breakpoint
CREATE INDEX "listening_hit_query_time_idx" ON "listening_hit" USING btree ("query_id","occurred_at");--> statement-breakpoint
CREATE INDEX "listening_query_ws_idx" ON "listening_query" USING btree ("workspace_id","enabled");