"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { readRequireAiDisclosure } from "@/lib/disclosure";
import { audit } from "@/lib/audit";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

const schema = z.object({ workspaceId: z.string().min(1), required: z.boolean() });

/**
 * workspace.settings.requireAiDisclosure — when on, synthetic-media content
 * cannot be published to a destination that offers no way to label it.
 */
export async function setRequireAiDisclosure(input: z.input<typeof schema>): Promise<ActionState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("Invalid setting.");
  const { workspaceId, required } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    const [ws] = await db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, workspaceId));
    if (!ws) return fail("Workspace not found.");
    const before = readRequireAiDisclosure(ws.settings);
    await db.update(workspace).set({ settings: { ...ws.settings, requireAiDisclosure: required }, updatedAt: new Date() }).where(eq(workspace.id, workspaceId));
    await audit({
      action: "workspace.settings", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId,
      targetType: "workspace", targetId: workspaceId, summary: { before: { requireAiDisclosure: before }, after: { requireAiDisclosure: required } },
    });
    return { ok: required ? "AI disclosure is now required." : "AI disclosure is no longer required." };
  });
}
