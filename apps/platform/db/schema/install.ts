/*
 * Install-level state for a self-hosted copy (docs/plans/m14.12-self-hosted.md).
 * Not tenant data: there is no organization_id here on purpose — a self-hosted
 * install has exactly one, and the update check belongs to the install.
 */
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** The newest build the update feed listed per channel, and when we last asked. One row per channel. */
export const installUpdate = pgTable("install_update", {
  channel: text("channel").primaryKey(),
  latestVersion: text("latest_version"),
  imageTag: text("image_tag"),
  notesUrl: text("notes_url"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  /** The feed's refusal or a network error, in words; null when the last check succeeded. */
  error: text("error"),
});
