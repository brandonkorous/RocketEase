CREATE TABLE "caption_track" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"source" text DEFAULT 'generated' NOT NULL,
	"words" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"media_job_id" text,
	"confidence" real,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"label" text NOT NULL,
	"kind" text DEFAULT 'stock' NOT NULL,
	"adapter" text NOT NULL,
	"remote_voice_id" text NOT NULL,
	"language" text,
	"note" text,
	"consent_person_name" text,
	"consent_evidence_asset_id" text,
	"authorised_by_user_id" text,
	"authorised_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"scope" text DEFAULT 'organic' NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "caption_track" ADD CONSTRAINT "caption_track_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caption_track" ADD CONSTRAINT "caption_track_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caption_track" ADD CONSTRAINT "caption_track_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caption_track" ADD CONSTRAINT "caption_track_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice" ADD CONSTRAINT "voice_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice" ADD CONSTRAINT "voice_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice" ADD CONSTRAINT "voice_consent_evidence_asset_id_asset_id_fk" FOREIGN KEY ("consent_evidence_asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice" ADD CONSTRAINT "voice_authorised_by_user_id_user_id_fk" FOREIGN KEY ("authorised_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice" ADD CONSTRAINT "voice_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "caption_track_asset_lang_idx" ON "caption_track" USING btree ("asset_id","language");--> statement-breakpoint
CREATE INDEX "voice_ws_idx" ON "voice" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_ws_remote_idx" ON "voice" USING btree ("workspace_id","adapter","remote_voice_id");