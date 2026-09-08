CREATE TABLE "install_update" (
	"channel" text PRIMARY KEY NOT NULL,
	"latest_version" text,
	"image_tag" text,
	"notes_url" text,
	"checked_at" timestamp with time zone NOT NULL,
	"error" text
);
