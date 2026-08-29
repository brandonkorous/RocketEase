"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { readBrandKit } from "@/lib/brand/read";
import { SECTION_SCHEMAS, type BrandSection } from "@/lib/brand/schema";
import { loadWorkspaceSettings, writeBrandSection } from "@/lib/brand/store";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "../content/shared";
import { auditShape, patchFor } from "./patch";

const schema = z.object({
  workspaceId: z.string().min(1),
  section: z.enum(Object.keys(SECTION_SCHEMAS) as [BrandSection, ...BrandSection[]]),
  values: z.unknown(),
});

const SAVED: Record<BrandSection, string> = {
  identity: "Identity saved.",
  voice: "Voice saved.",
  visual: "Visual identity saved.",
  messaging: "Messaging saved.",
  audiences: "Audiences saved.",
  rules: "Rules saved.",
  channels: "Channel presence saved.",
  assets: "Brand assets saved.",
};

/**
 * One section of the brand kit. Editing is `workspace.settings` — the same bar
 * as the brand voice it replaces — while every member can read the kit.
 */
export async function saveBrandSection(input: z.input<typeof schema>): Promise<ActionState> {
  const outer = schema.safeParse(input);
  if (!outer.success) return fail("That section can't be saved.");
  const { workspaceId, section } = outer.data;
  const parsed = SECTION_SCHEMAS[section].safeParse(outer.data.values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the fields on this page.");

  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    const settings = await loadWorkspaceSettings(workspaceId);
    if (!settings) return fail("Workspace not found.");
    const before = readBrandKit(settings);
    const patch = patchFor(section, parsed.data, before);
    const stored = (settings.brandKit ?? {}) as Record<string, unknown>;
    await writeBrandSection(workspaceId, settings, patch);
    const after = readBrandKit({ ...settings, brandKit: { ...stored, ...patch } });
    await audit({
      action: "workspace.brand",
      actorUserId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId,
      targetType: "workspace",
      targetId: workspaceId,
      summary: { note: section, before: auditShape(section, before), after: auditShape(section, after) },
    });
    revalidatePath(`/app/${workspaceId}/brand`, "layout");
    return { ok: SAVED[section] };
  });
}
