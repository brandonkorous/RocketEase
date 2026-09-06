CREATE TABLE "bio_link" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"page_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bio_link_click" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"page_id" text NOT NULL,
	"link_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"day" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bio_page" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"slug" text NOT NULL,
	"live" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"avatar" text DEFAULT 'logo' NOT NULL,
	"button_style" text DEFAULT 'black' NOT NULL,
	"show_posts" boolean DEFAULT true NOT NULL,
	"posts_channel_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bio_link" ADD CONSTRAINT "bio_link_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bio_link" ADD CONSTRAINT "bio_link_page_id_bio_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."bio_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bio_link_click" ADD CONSTRAINT "bio_link_click_page_id_bio_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."bio_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bio_link_click" ADD CONSTRAINT "bio_link_click_link_id_bio_link_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."bio_link"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bio_page" ADD CONSTRAINT "bio_page_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bio_page" ADD CONSTRAINT "bio_page_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bio_page" ADD CONSTRAINT "bio_page_posts_channel_id_channel_id_fk" FOREIGN KEY ("posts_channel_id") REFERENCES "public"."channel"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bio_link_page_idx" ON "bio_link" USING btree ("page_id","position");--> statement-breakpoint
CREATE INDEX "bio_link_click_link_idx" ON "bio_link_click" USING btree ("link_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bio_page_slug_idx" ON "bio_page" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "bio_page_workspace_idx" ON "bio_page" USING btree ("workspace_id");