"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { COPYABLE, copyPatch, copySummary } from "@/lib/brand/copy";
import { readBrandKit } from "@/lib/brand/read";
import type { BrandSection } from "@/lib/brand/schema";
import { brandLogoKey, loadWorkspaceSettings, logoExtension, writeBrandSection } from "@/lib/brand/store";
import type { Logo } from "@/lib/brand/types";
import { log } from "@/lib/log";
import { listUserWorkspaces, requireCapability } from "@/lib/session";
import { getObjectBuffer, putObject } from "@/lib/storage";
import { fail, guard, type ActionState } from "../content/shared";

const schema = z.object({
  workspaceId: z.string().min(1),
  sourceWorkspaceId: z.string().min(1),
  sections: z.array(z.enum(COPYABLE as [BrandSection, ...BrandSection[]])).min(1),
});

/** Logo files are copied object by object into the target's own keys; one storage cannot read is left out. */
async function copyLogos(targetWorkspaceId: string, logos: Logo[]): Promise<Logo[]> {
  const out: Logo[] = [];
  for (const l of logos) {
    const ext = logoExtension(l.mimeType);
    if (!ext) continue;
    try {
      const buf = await getObjectBuffer(l.key);
      const key = brandLogoKey(targetWorkspaceId, l.role, ext);
      await putObject(key, buf, l.mimeType);
      out.push({ ...l, key, bytes: buf.length });
    } catch (err) {
      log.warn("brand logo not copied", { role: l.role, err: String(err) });
    }
  }
  return out;
}

/**
 * Replace the chosen sections of this workspace's kit with another workspace's.
 * The actor must be a member of BOTH workspaces; editing here is `workspace.settings`.
 */
export async function copyBrandKit(input: z.input<typeof schema>): Promise<ActionState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("Choose a workspace and at least one section.");
  const { workspaceId, sourceWorkspaceId, sections } = parsed.data;
  if (workspaceId === sourceWorkspaceId) return fail("Choose a different workspace to copy from.");
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    const source = (await listUserWorkspaces(ctx.session.user.id)).find((w) => w.id === sourceWorkspaceId);
    if (!source) return fail("You are not a member of that workspace.");
    const [settings, sourceSettings] = await Promise.all([loadWorkspaceSettings(workspaceId), loadWorkspaceSettings(sourceWorkspaceId)]);
    if (!settings || !sourceSettings) return fail("Workspace not found.");
    const sourceKit = readBrandKit(sourceSettings);
    const logos = sections.includes("visual") ? await copyLogos(workspaceId, sourceKit.visual.logos) : [];
    await writeBrandSection(workspaceId, settings, copyPatch(sourceKit, readBrandKit(settings), sections, logos));
    await audit({
      action: "workspace.brand",
      actorUserId: ctx.session.user.id,
      organizationId: ctx.workspace.organizationId,
      workspaceId,
      targetType: "workspace",
      targetId: workspaceId,
      summary: { note: `copy:${sourceWorkspaceId}`, after: copySummary(sections, logos) },
    });
    revalidatePath(`/app/${workspaceId}/brand`, "layout");
    const n = new Set(sections).size;
    return { ok: `Copied ${n === 1 ? "1 section" : `${n} sections`} from ${source.name}.` };
  });
}
