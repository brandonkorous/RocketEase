CREATE TYPE "public"."conversation_kind" AS ENUM('comment', 'mention', 'message', 'review');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('open', 'snoozed', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."message_delivery_state" AS ENUM('received', 'queued', 'sending', 'sent', 'ambiguous', 'failed');--> statement-breakpoint
CREATE TYPE "public"."conversation_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TABLE "contact" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"email" text,
	"location" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"merged_into_contact_id" text,
	"merged_from" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_identity" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"provider" "provider_key" NOT NULL,
	"network" text NOT NULL,
	"remote_id" text NOT NULL,
	"handle" text,
	"profile_url" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"kind" "conversation_kind" NOT NULL,
	"remote_thread_id" text NOT NULL,
	"post_remote_id" text,
	"post_url" text,
	"status" "conversation_status" DEFAULT 'open' NOT NULL,
	"priority" "conversation_priority" DEFAULT 'normal' NOT NULL,
	"assignee_user_id" text,
	"preview" text DEFAULT '' NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"response_due_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_event" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor_user_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_settings" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"first_response_target_minutes" integer DEFAULT 60 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internal_note" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"conversation_id" text,
	"contact_id" text,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"direction" text NOT NULL,
	"remote_id" text,
	"in_reply_to_remote_id" text,
	"author_contact_id" text,
	"author_user_id" text,
	"body" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rating" integer,
	"delivery_state" "message_delivery_state" DEFAULT 'received' NOT NULL,
	"idempotency_key" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_reply" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"shortcut" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identity" ADD CONSTRAINT "contact_identity_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identity" ADD CONSTRAINT "contact_identity_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_event" ADD CONSTRAINT "conversation_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_event" ADD CONSTRAINT "conversation_event_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_event" ADD CONSTRAINT "conversation_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_settings" ADD CONSTRAINT "inbox_settings_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_note" ADD CONSTRAINT "internal_note_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_note" ADD CONSTRAINT "internal_note_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_note" ADD CONSTRAINT "internal_note_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_note" ADD CONSTRAINT "internal_note_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_author_contact_id_contact_id_fk" FOREIGN KEY ("author_contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_reply" ADD CONSTRAINT "saved_reply_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_reply" ADD CONSTRAINT "saved_reply_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_reply" ADD CONSTRAINT "saved_reply_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_ws_idx" ON "contact" USING btree ("workspace_id","display_name");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identity_ws_net_remote_idx" ON "contact_identity" USING btree ("workspace_id","network","remote_id");--> statement-breakpoint
CREATE INDEX "contact_identity_contact_idx" ON "contact_identity" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_channel_thread_idx" ON "conversation" USING btree ("channel_id","remote_thread_id");--> statement-breakpoint
CREATE INDEX "conversation_ws_status_idx" ON "conversation" USING btree ("workspace_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "conversation_ws_assignee_idx" ON "conversation" USING btree ("workspace_id","assignee_user_id");--> statement-breakpoint
CREATE INDEX "conversation_contact_idx" ON "conversation" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "conversation_event_conversation_idx" ON "conversation_event" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "internal_note_conversation_idx" ON "internal_note" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "internal_note_contact_idx" ON "internal_note" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_channel_remote_idx" ON "message" USING btree ("channel_id","remote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_idempotency_idx" ON "message" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "message_conversation_idx" ON "message" USING btree ("conversation_id","occurred_at");--> statement-breakpoint
CREATE INDEX "saved_reply_ws_idx" ON "saved_reply" USING btree ("workspace_id","title");