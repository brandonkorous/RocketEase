CREATE TABLE "agency_billing_account" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"stripe_account_id" text,
	"livemode" boolean DEFAULT false NOT NULL,
	"scope" text DEFAULT 'read_write' NOT NULL,
	"status" text DEFAULT 'connecting' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"connected_by_user_id" text,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_statement" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"period" text NOT NULL,
	"currency" text NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_cents" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"stripe_invoice_id" text,
	"stripe_invoice_number" text,
	"hosted_invoice_url" text,
	"billing_email" text,
	"days_until_due" integer DEFAULT 30 NOT NULL,
	"created_by_user_id" text,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_rate" ADD COLUMN "billing_name" text;--> statement-breakpoint
ALTER TABLE "client_rate" ADD COLUMN "billing_email" text;--> statement-breakpoint
ALTER TABLE "client_rate" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "agency_billing_account" ADD CONSTRAINT "agency_billing_account_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_billing_account" ADD CONSTRAINT "agency_billing_account_connected_by_user_id_user_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_statement" ADD CONSTRAINT "client_statement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_statement" ADD CONSTRAINT "client_statement_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_statement" ADD CONSTRAINT "client_statement_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agency_billing_account_org_idx" ON "agency_billing_account" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "client_statement_ws_period_idx" ON "client_statement" USING btree ("workspace_id","period");--> statement-breakpoint
CREATE INDEX "client_statement_org_idx" ON "client_statement" USING btree ("organization_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "client_statement_invoice_idx" ON "client_statement" USING btree ("stripe_invoice_id");