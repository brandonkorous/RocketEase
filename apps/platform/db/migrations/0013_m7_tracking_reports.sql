CREATE TABLE "external_recipient" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verification_token_hash" text,
	"verification_sent_at" timestamp with time zone,
	"verification_expires_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"verified_from" text,
	"unsubscribed_at" timestamp with time zone,
	"requested_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_share" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"passcode_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scim_identity" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"external_id" text,
	"user_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scim_token" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"created_by_user_id" text,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"organization_id" text,
	"domain" text NOT NULL,
	"enforced" boolean DEFAULT false,
	CONSTRAINT "sso_provider_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
CREATE TABLE "conversion_event" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"source_id" text NOT NULL,
	"event_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"day" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"currency" text,
	"dimension" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dimension_hash" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversion_fact" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"source_id" text NOT NULL,
	"day" text NOT NULL,
	"metric" text NOT NULL,
	"value" numeric(18, 2) NOT NULL,
	"currency" text,
	"dimension" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dimension_hash" text NOT NULL,
	"source" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"fresh_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_source" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'connecting' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret" jsonb,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"health" jsonb DEFAULT '{"ok":true}'::jsonb NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_by_user_id" text,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_definition" ADD COLUMN "client_facing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "report_definition" ADD COLUMN "external_recipients" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "external_recipient" ADD CONSTRAINT "external_recipient_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_recipient" ADD CONSTRAINT "external_recipient_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_recipient" ADD CONSTRAINT "external_recipient_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_share" ADD CONSTRAINT "report_share_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_share" ADD CONSTRAINT "report_share_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_share" ADD CONSTRAINT "report_share_run_id_report_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."report_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_share" ADD CONSTRAINT "report_share_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_share" ADD CONSTRAINT "report_share_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_identity" ADD CONSTRAINT "scim_identity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_identity" ADD CONSTRAINT "scim_identity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_token" ADD CONSTRAINT "scim_token_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_token" ADD CONSTRAINT "scim_token_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_event" ADD CONSTRAINT "conversion_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_event" ADD CONSTRAINT "conversion_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_event" ADD CONSTRAINT "conversion_event_source_id_tracking_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."tracking_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_fact" ADD CONSTRAINT "conversion_fact_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_fact" ADD CONSTRAINT "conversion_fact_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_fact" ADD CONSTRAINT "conversion_fact_source_id_tracking_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."tracking_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_source" ADD CONSTRAINT "tracking_source_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_source" ADD CONSTRAINT "tracking_source_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_source" ADD CONSTRAINT "tracking_source_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_recipient_ws_email_idx" ON "external_recipient" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "external_recipient_token_idx" ON "external_recipient" USING btree ("verification_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "report_share_token_idx" ON "report_share" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "report_share_run_idx" ON "report_share" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scim_identity_org_user_idx" ON "scim_identity" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scim_identity_org_username_idx" ON "scim_identity" USING btree ("organization_id","user_name");--> statement-breakpoint
CREATE INDEX "scim_identity_org_external_idx" ON "scim_identity" USING btree ("organization_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scim_token_hash_idx" ON "scim_token" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "scim_token_org_idx" ON "scim_token" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversion_event_dedupe_idx" ON "conversion_event" USING btree ("source_id","event_id");--> statement-breakpoint
CREATE INDEX "conversion_event_day_idx" ON "conversion_event" USING btree ("source_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "conversion_fact_grain_idx" ON "conversion_fact" USING btree ("source_id","day","metric","dimension_hash");--> statement-breakpoint
CREATE INDEX "conversion_fact_ws_day_idx" ON "conversion_fact" USING btree ("workspace_id","day","metric");--> statement-breakpoint
CREATE INDEX "conversion_fact_campaign_idx" ON "conversion_fact" USING btree ("workspace_id","day");--> statement-breakpoint
CREATE INDEX "tracking_source_ws_idx" ON "tracking_source" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE INDEX "tracking_source_status_idx" ON "tracking_source" USING btree ("status");