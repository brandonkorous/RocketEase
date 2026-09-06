ALTER TABLE "conversation" ADD COLUMN "moderated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "moderation" jsonb;--> statement-breakpoint
CREATE INDEX "conversation_ws_moderated_idx" ON "conversation" USING btree ("workspace_id","moderated_at");