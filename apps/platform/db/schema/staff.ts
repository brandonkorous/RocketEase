/*
 * RocketEase staff (M12.1 WP0).
 *
 * Operators of the product, not customers of it. Staff is a property of a
 * PERSON and is orthogonal to tenancy: it is never a workspace role, never an
 * organization role, and it never widens `requireWorkspace`. The staff surface
 * lives at /staff and reads its own tables — there is deliberately no code path
 * where being staff changes what a tenant-scoped query returns.
 *
 * `support` reads operational metadata (organizations, plan state, beta grants).
 * `admin` additionally grants and revokes betas. Neither reads customer content.
 */
import { sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const STAFF_ROLES = ["support", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const staffUser = pgTable("staff_user", {
  /** One row per person; the user id is the key, so staff cannot be duplicated. */
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").$type<StaffRole>().notNull().default("support"),
  /** Who made them staff. Null once that person's account is gone. */
  grantedByUserId: text("granted_by_user_id").references(() => user.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type StaffUser = typeof staffUser.$inferSelect;
