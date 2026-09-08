CREATE TABLE "import_source" (
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
	"last_error" text,
	"created_by_user_id" text NOT NULL,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_source" ADD CONSTRAINT "import_source_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_source" ADD CONSTRAINT "import_source_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_source" ADD CONSTRAINT "import_source_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_source_ws_idx" ON "import_source" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "import_source_ws_kind_user_idx" ON "import_source" USING btree ("workspace_id","kind","created_by_user_id");