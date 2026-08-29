"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { brandVoiceSchema, readBrandVoice, type BrandVoice } from "@/lib/ai/brand-voice";
import { audit } from "@/lib/audit";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";

const schema = brandVoiceSchema.extend({ workspaceId: z.string().min(1) });

const clean = (list: string[]) => list.map((s) => s.trim()).filter(Boolean);

/** Audited shape: what changed, not the whole essay. */
const shape = (v: BrandVoice) => ({ tone: v.tone, audience: v.audience, doList: v.doList.length, dontList: v.dontList.length, examples: v.examples.length });

/**
 * Brand voice lives in workspace.settings.brandVoice — it only ever shapes a
 * draft a person edits and sends, so it needs no table of its own.
 */
export async function setBrandVoice(input: z.input<typeof schema>): Promise<ActionState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the brand voice fields.");
  const { workspaceId, ...raw } = parsed.data;
  const brandVoice: BrandVoice = { tone: raw.tone, audience: raw.audience, doList: clean(raw.doList), dontList: clean(raw.dontList), examples: clean(raw.examples) };
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    const [ws] = await db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, workspaceId));
    if (!ws) return fail("Workspace not found.");
    await db.update(workspace).set({ settings: { ...ws.settings, brandVoice }, updatedAt: new Date() }).where(eq(workspace.id, workspaceId));
    await audit({
      action: "workspace.settings",
      actorUserId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId,
      targetType: "workspace",
      targetId: workspaceId,
      summary: { before: { brandVoice: shape(readBrandVoice(ws.settings)) }, after: { brandVoice: shape(brandVoice) } },
    });
    return { ok: "Brand voice saved." };
  });
}
