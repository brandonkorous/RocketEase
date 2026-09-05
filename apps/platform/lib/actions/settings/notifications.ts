"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workspaceMembership } from "@/db/schema/app";
import { audit } from "@/lib/audit";
import { PREFS, PREF_KEYS, type ChannelChoice, type StoredPrefs } from "@/lib/notifications/catalog";
import { requireWorkspace } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

const schema = z.object({ workspaceId: z.string().min(1), pref: z.enum(PREF_KEYS), channel: z.enum(["inApp", "email"]), on: z.boolean() });

/** A stored boolean is the pre-M14.2 shape (email opt-in); it becomes the email half of the choice. */
const asChoice = (v: boolean | ChannelChoice | undefined): ChannelChoice => (typeof v === "boolean" ? { email: v } : { ...(v ?? {}) });

/** Own preferences only; any member can set theirs. Locked channels refuse, with the reason. */
export async function setNotificationPreference(input: z.input<typeof schema>): Promise<ActionState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("Unknown notification preference.");
  const { workspaceId, pref, channel, on } = parsed.data;
  const spec = PREFS.find((p) => p.key === pref)!;
  if (!on && spec.lock?.[channel]) return fail(`${spec.label} always reach you ${channel === "inApp" ? "in the app" : "by email"}; that one cannot be switched off.`);
  return guard(async () => {
    const ctx = await requireWorkspace(workspaceId);
    const where = and(eq(workspaceMembership.workspaceId, workspaceId), eq(workspaceMembership.userId, ctx.session.user.id));
    const [m] = await db.select({ prefs: workspaceMembership.notificationPreferences }).from(workspaceMembership).where(where);
    if (!m) return fail("Membership not found.");
    const stored: StoredPrefs = { ...m.prefs };
    stored[pref] = { ...asChoice(stored[pref]), [channel]: on };
    await db.update(workspaceMembership).set({ notificationPreferences: stored }).where(where);
    await audit({ action: "membership.notification_preferences", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "workspace_membership", targetId: ctx.session.user.id, summary: { after: { [pref]: stored[pref] } } });
    return { ok: `${spec.label}: ${channel === "inApp" ? "in-app" : "email"} ${on ? "on" : "off"}.` };
  });
}
