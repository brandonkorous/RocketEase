CREATE TYPE "public"."channel_status" AS ENUM('connecting', 'syncing', 'healthy', 'degraded', 'action_required', 'revoked', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('selecting', 'active', 'expired', 'revoked', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."provider_key" AS ENUM('mock', 'meta', 'linkedin', 'tiktok');--> statement-breakpoint
CREATE TABLE "channel" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"provider" "provider_key" NOT NULL,
	"network" text NOT NULL,
	"kind" text NOT NULL,
	"remote_id" text NOT NULL,
	"name" text NOT NULL,
	"handle" text,
	"avatar_url" text,
	"channel_secret" jsonb,
	"capabilities" jsonb NOT NULL,
	"status" "channel_status" DEFAULT 'connecting' NOT NULL,
	"health" jsonb DEFAULT '{"tokenOk":true,"permissionsOk":true}'::jsonb NOT NULL,
	"last_sync_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_state" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "provider_key" NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"nonce" text NOT NULL,
	"reconnect_connection_id" text,
	"redirect_to" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_connection" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"provider" "provider_key" NOT NULL,
	"provider_user_id" text NOT NULL,
	"provider_user_name" text,
	"secret" jsonb NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"status" "connection_status" DEFAULT 'selecting' NOT NULL,
	"last_error" text,
	"last_refreshed_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_cursor" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" text NOT NULL,
	"resource" text NOT NULL,
	"cursor" text,
	"fresh_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_receipt" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "provider_key" NOT NULL,
	"event_id" text NOT NULL,
	"channel_remote_id" text,
	"signature_ok" text DEFAULT 'true' NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_connection_id_provider_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD CONSTRAINT "oauth_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connection" ADD CONSTRAINT "provider_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connection" ADD CONSTRAINT "provider_connection_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connection" ADD CONSTRAINT "provider_connection_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_cursor" ADD CONSTRAINT "sync_cursor_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_ws_remote_idx" ON "channel" USING btree ("workspace_id","provider","remote_id");--> statement-breakpoint
CREATE INDEX "channel_ws_status_idx" ON "channel" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "oauth_state_expires_idx" ON "oauth_state" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "provider_connection_ws_idx" ON "provider_connection" USING btree ("workspace_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_cursor_channel_resource_idx" ON "sync_cursor" USING btree ("channel_id","resource");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_receipt_event_idx" ON "webhook_receipt" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "webhook_receipt_pending_idx" ON "webhook_receipt" USING btree ("received_at");