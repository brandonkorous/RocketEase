"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { readBrandKit } from "@/lib/brand/read";
import { brandLogoKey, loadWorkspaceSettings, logoExtension, writeBrandSection } from "@/lib/brand/store";
import { LOGO_ROLES, type Logo, type LogoRole } from "@/lib/brand/types";
import { requireCapability } from "@/lib/session";
import { headObject, presignUpload } from "@/lib/storage";
import { fail, guard, type ActionState } from "../content/shared";

const MAX_LOGO_BYTES = 512 * 1024;
const TOO_BIG = "Logos must be under 512 KB so they can be embedded in reports and creative.";

const base = z.object({ workspaceId: z.string().min(1), role: z.enum(LOGO_ROLES) });
const beginSchema = base.extend({ mimeType: z.string().min(1), bytes: z.number().int().positive() });
const completeSchema = base.extend({ key: z.string().min(1), note: z.string().trim().max(300).default("") });

async function loadKit(workspaceId: string) {
  const settings = await loadWorkspaceSettings(workspaceId);
  return settings ? { settings, kit: readBrandKit(settings) } : null;
}

const replace = (logos: Logo[], role: LogoRole, next: Logo | null) => [...logos.filter((l) => l.role !== role), ...(next ? [next] : [])];

/** Step 1: a workspace-scoped key plus a presigned PUT — the same door uploads use. */
export async function beginBrandLogoUpload(input: z.input<typeof beginSchema>) {
  const parsed = beginSchema.safeParse(input);
  if (!parsed.success) return fail("Check the logo file and try again.");
  const { workspaceId, role, mimeType, bytes } = parsed.data;
  return guard(async () => {
    await requireCapability(workspaceId, "workspace.settings");
    const ext = logoExtension(mimeType);
    if (!ext) return fail("Use a PNG, JPG, WebP, or SVG logo.");
    if (bytes > MAX_LOGO_BYTES) return fail(TOO_BIG);
    const key = brandLogoKey(workspaceId, role, ext);
    return { key, upload: await presignUpload(key, mimeType, MAX_LOGO_BYTES) };
  });
}

/** Step 2: the browser finished the PUT — verify the object landed before recording it. */
export async function completeBrandLogoUpload(input: z.input<typeof completeSchema>): Promise<ActionState> {
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return fail("That logo can't be saved.");
  const { workspaceId, role, key, note } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    if (!key.startsWith(`ws/${workspaceId}/brand/`)) return fail("That logo does not belong to this workspace.");
    const loaded = await loadKit(workspaceId);
    if (!loaded) return fail("Workspace not found.");
    const head = await headObject(key);
    if (!head) return fail("The upload did not complete. Try again.");
    if (head.bytes > MAX_LOGO_BYTES) return fail(TOO_BIG);
    const logo: Logo = { role, key, mimeType: head.contentType, bytes: head.bytes, note };
    const logos = replace(loaded.kit.visual.logos, role, logo);
    await writeBrandSection(workspaceId, loaded.settings, { visual: { ...loaded.kit.visual, logos } });
    await audit({ action: "workspace.brand", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "workspace", targetId: workspaceId, summary: { note: `logo:${role}`, after: { key, bytes: head.bytes } } });
    revalidatePath(`/app/${workspaceId}/brand`, "layout");
    return { ok: "Logo saved." };
  });
}

/** The row goes; the object stays until storage lifecycle removes it, so an in-flight report never 404s. */
export async function removeBrandLogo(input: z.input<typeof base>): Promise<ActionState> {
  const parsed = base.safeParse(input);
  if (!parsed.success) return fail("That logo can't be removed.");
  const { workspaceId, role } = parsed.data;
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "workspace.settings");
    const loaded = await loadKit(workspaceId);
    if (!loaded) return fail("Workspace not found.");
    const logos = replace(loaded.kit.visual.logos, role, null);
    await writeBrandSection(workspaceId, loaded.settings, { visual: { ...loaded.kit.visual, logos } });
    await audit({ action: "workspace.brand", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "workspace", targetId: workspaceId, summary: { note: `logo:${role}`, before: { role }, after: null } });
    revalidatePath(`/app/${workspaceId}/brand`, "layout");
    return { ok: "Logo removed." };
  });
}
