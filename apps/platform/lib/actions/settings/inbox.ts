"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { inboxSettings } from "@/db/schema/engagement";
import { audit } from "@/lib/audit";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

const schema = z.object({ workspaceId: z.string().min(1), minutes: z.coerce.number().int().min(5, "At least 5 minutes").max(10_080, "At most 7 days") });

/** ENG-004: per-workspace first-response target, applied to new conversations. */
export async function setFirstResponseTarget(input: z.input<typeof schema>): Promise<ActionState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Enter minutes between 5 and 10,080.");
  const { workspaceId, minutes } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    const [before] = await db.select().from(inboxSettings).where(eq(inboxSettings.workspaceId, workspaceId));
    await db.insert(inboxSettings).values({ workspaceId, firstResponseTargetMinutes: minutes }).onConflictDoUpdate({ target: inboxSettings.workspaceId, set: { firstResponseTargetMinutes: minutes, updatedAt: new Date() } });
    await audit({ action: "inbox_settings.update", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "workspace", targetId: workspaceId, summary: { before: { firstResponseTargetMinutes: before?.firstResponseTargetMinutes ?? 60 }, after: { firstResponseTargetMinutes: minutes } } });
    return { ok: "Response target saved. Applies to new conversations." };
  });
}
