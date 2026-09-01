ALTER TABLE "media_job" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "media_job" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "media_job" ADD COLUMN "credits" numeric(12, 4);