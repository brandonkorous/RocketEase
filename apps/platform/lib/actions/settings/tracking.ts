"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { audit } from "@/lib/audit";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

const utm = z.string().trim().max(100).regex(/^[\w.-]*$/, "Use letters, numbers, dots, dashes, or underscores");
const schema = z.object({
  workspaceId: z.string().min(1),
  utmSource: utm.default(""),
  utmMedium: utm.default("social"),
  utmCampaign: utm.default(""),
});

/** Workspace-level UTM defaults, stored in workspace.settings.tracking. Conversion sources live in `tracking_source`. */
export async function setTrackingSettings(input: z.input<typeof schema>): Promise<ActionState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the tracking fields.");
  const { workspaceId, ...tracking } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    const [ws] = await db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, workspaceId));
    if (!ws) return fail("Workspace not found.");
    await db.update(workspace).set({ settings: { ...ws.settings, tracking }, updatedAt: new Date() }).where(eq(workspace.id, workspaceId));
    await audit({ action: "workspace.settings", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "workspace", targetId: workspaceId, summary: { before: { tracking: ws.settings.tracking ?? null }, after: { tracking } } });
    return { ok: "Tracking defaults saved." };
  });
}
