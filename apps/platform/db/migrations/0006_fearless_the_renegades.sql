CREATE TYPE "public"."asset_kind" AS ENUM('image', 'video', 'document');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('pending', 'clean', 'infected', 'error');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "asset" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"folder_id" text,
	"kind" "asset_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer,
	"width" integer,
	"height" integer,
	"duration_seconds" integer,
	"checksum_sha256" text,
	"title" text,
	"alt_text" text,
	"caption" text,
	"tag_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rights_note" text,
	"rights_expires_at" timestamp with time zone,
	"upload_status" "upload_status" DEFAULT 'pending' NOT NULL,
	"scan_status" "scan_status" DEFAULT 'pending' NOT NULL,
	"scan_note" text,
	"processing_error" text,
	"uploaded_by_user_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_rendition" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" text NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folder" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_folder_id_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_rendition" ADD CONSTRAINT "asset_rendition_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_ws_created_idx" ON "asset" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "asset_ws_kind_idx" ON "asset" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_storage_key_idx" ON "asset" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_rendition_asset_kind_idx" ON "asset_rendition" USING btree ("asset_id","kind");--> statement-breakpoint
CREATE INDEX "folder_ws_idx" ON "folder" USING btree ("workspace_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_ws_name_idx" ON "tag" USING btree ("workspace_id","name");