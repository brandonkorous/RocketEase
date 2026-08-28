CREATE TABLE "outbox_event" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"organization_id" text,
	"workspace_id" text,
	"dedupe_key" text,
	"run_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"relayed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "outbox_event_pending_idx" ON "outbox_event" USING btree ("created_at") WHERE "outbox_event"."relayed_at" is null;