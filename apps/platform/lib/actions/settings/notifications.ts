"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workspaceMembership } from "@/db/schema/app";
import { audit } from "@/lib/audit";
import { requireWorkspace } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";
import { NOTIFICATION_KIND_KEYS } from "./catalog";

const schema = z.object({ workspaceId: z.string().min(1), kind: z.enum(NOTIFICATION_KIND_KEYS), email: z.boolean() });

/** Own preferences only; any member can set theirs. */
export async function setNotificationPreference(input: z.input<typeof schema>): Promise<ActionState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("Unknown notification kind.");
  const { workspaceId, kind, email } = parsed.data;
  return guard(async () => {
    const ctx = await requireWorkspace(workspaceId);
    const where = and(eq(workspaceMembership.workspaceId, workspaceId), eq(workspaceMembership.userId, ctx.session.user.id));
    const [m] = await db.select({ prefs: workspaceMembership.notificationPreferences }).from(workspaceMembership).where(where);
    if (!m) return fail("Membership not found.");
    const next = { ...m.prefs, [kind]: email };
    await db.update(workspaceMembership).set({ notificationPreferences: next }).where(where);
    await audit({ action: "membership.notification_preferences", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "workspace_membership", targetId: ctx.session.user.id, summary: { after: { [kind]: email } } });
    return { ok: email ? "Email on." : "Email off." };
  });
}
