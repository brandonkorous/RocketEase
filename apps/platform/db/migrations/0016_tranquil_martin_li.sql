CREATE TYPE "public"."deletion_request_kind" AS ENUM('deauthorize', 'data_deletion');--> statement-breakpoint
CREATE TYPE "public"."deletion_request_status" AS ENUM('received', 'processing', 'completed', 'no_match', 'failed');--> statement-breakpoint
CREATE TABLE "provider_deletion_request" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "provider_key" NOT NULL,
	"kind" "deletion_request_kind" NOT NULL,
	"remote_user_id" text NOT NULL,
	"confirmation_code" text NOT NULL,
	"status" "deletion_request_status" DEFAULT 'received' NOT NULL,
	"result" jsonb,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "provider_deletion_request_code_idx" ON "provider_deletion_request" USING btree ("confirmation_code");--> statement-breakpoint
CREATE INDEX "provider_deletion_request_remote_idx" ON "provider_deletion_request" USING btree ("provider","remote_user_id");