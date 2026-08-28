"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { brandingLogoKey, loadBranding, saveBranding } from "@/lib/reports/branding";
import { headObject, presignUpload } from "@/lib/storage";
import { fail, guard, type ActionState } from "@/lib/actions/content/shared";
import { requireOrgAdmin } from "./shared";

const schema = z.object({
  agencyName: z.string().max(80).default(""),
  footerText: z.string().max(300).default(""),
  replyTo: z.union([z.literal(""), z.string().email()]).default(""),
});
export type BrandingInput = z.infer<typeof schema>;

const LOGO_TYPES: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/svg+xml": ".svg" };
const MAX_LOGO_BYTES = 512 * 1024;

/** Agency name, footer and reply-to used on every client-facing report and email. */
export async function saveAgencyBranding(organizationId: string, input: BrandingInput): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOrgAdmin(organizationId);
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail("Check the agency name, footer, and reply-to address.");
    const before = await loadBranding(organizationId);
    const after = { ...before, ...parsed.data };
    await saveBranding(organizationId, after);
    await audit({ action: "agency.branding_update", actorUserId: ctx.userId, organizationId, targetType: "organization", targetId: organizationId, summary: { before, after } });
    revalidatePath("/agency");
    return { ok: "Agency branding saved." };
  });
}

/** Step 1 of the logo upload: an org-scoped key plus a presigned PUT (same flow as the content library). */
export async function beginAgencyLogoUpload(organizationId: string, input: { mimeType: string; bytes: number }) {
  return guard(async () => {
    await requireOrgAdmin(organizationId);
    const ext = LOGO_TYPES[input.mimeType];
    if (!ext) return fail("Use a PNG, JPG, WebP, or SVG logo.");
    if (!Number.isFinite(input.bytes) || input.bytes <= 0 || input.bytes > MAX_LOGO_BYTES) return fail("Logos must be under 512 KB so they can be embedded in the report.");
    const key = brandingLogoKey(organizationId, ext);
    const upload = await presignUpload(key, input.mimeType, MAX_LOGO_BYTES);
    return { key, upload };
  });
}

/** Step 2: the browser finished the PUT — verify the object landed, then record it. */
export async function completeAgencyLogoUpload(organizationId: string, key: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOrgAdmin(organizationId);
    if (!key.startsWith(`org/${organizationId}/branding/`)) return fail("That logo does not belong to this organization.");
    const head = await headObject(key);
    if (!head) return fail("The upload did not complete. Try again.");
    if (head.bytes > MAX_LOGO_BYTES) return fail("That logo is too large to embed in a report.");
    const before = await loadBranding(organizationId);
    await saveBranding(organizationId, { ...before, logoKey: key });
    await audit({ action: "agency.branding_update", actorUserId: ctx.userId, organizationId, targetType: "organization", targetId: organizationId, summary: { before, after: { ...before, logoKey: key } } });
    revalidatePath("/agency");
    return { ok: "Logo updated." };
  });
}

export async function removeAgencyLogo(organizationId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOrgAdmin(organizationId);
    const before = await loadBranding(organizationId);
    await saveBranding(organizationId, { ...before, logoKey: null });
    await audit({ action: "agency.branding_update", actorUserId: ctx.userId, organizationId, targetType: "organization", targetId: organizationId, summary: { before, after: { ...before, logoKey: null } } });
    revalidatePath("/agency");
    return { ok: "Logo removed." };
  });
}

/** Per-client: put the client's own brand on their reports instead of the agency's. */
export async function setClientBrand(organizationId: string, workspaceId: string, useClientBrand: boolean): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOrgAdmin(organizationId);
    const before = await loadBranding(organizationId);
    const clientBrand = { ...before.clientBrand, [workspaceId]: useClientBrand };
    if (!useClientBrand) delete clientBrand[workspaceId];
    await saveBranding(organizationId, { ...before, clientBrand });
    await audit({ action: "agency.branding_update", actorUserId: ctx.userId, organizationId, workspaceId, targetType: "workspace", targetId: workspaceId, summary: { after: { useClientBrand } } });
    revalidatePath("/agency");
    return { ok: useClientBrand ? "Reports for this client use their own brand." : "Reports for this client use the agency brand." };
  });
}
