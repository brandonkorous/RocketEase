CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TABLE "workspace_invitation" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "workspace_role" DEFAULT 'viewer' NOT NULL,
	"grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"token" text NOT NULL,
	"invited_by_user_id" text,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_invitation" ADD CONSTRAINT "workspace_invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation" ADD CONSTRAINT "workspace_invitation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation" ADD CONSTRAINT "workspace_invitation_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation" ADD CONSTRAINT "workspace_invitation_accepted_by_user_id_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitation_token_idx" ON "workspace_invitation" USING btree ("token");--> statement-breakpoint
CREATE INDEX "workspace_invitation_ws_idx" ON "workspace_invitation" USING btree ("workspace_id","status");