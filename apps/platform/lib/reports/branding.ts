/*
 * Agency branding for client-facing reports (users.md agency personas).
 *
 * Stored on the organization's Better Auth `metadata` column (JSON text) so no
 * new table is needed and the billing boundary owns it. Monochrome by rule
 * (design.md): a logo and names, never an accent colour. Parsing lives in
 * branding-data.ts; this file is the database and storage half.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organization } from "@/db/schema/auth";
import { getObjectBuffer, headObject } from "@/lib/storage";
import { log } from "@/lib/log";
import { mergeBranding, parseBranding, type AgencyBranding } from "./branding-data";

export { EMPTY_BRANDING, brandingLogoKey, mergeBranding, parseBranding, parseClientBrand } from "./branding-data";
export type { AgencyBranding };

export async function loadBranding(organizationId: string): Promise<AgencyBranding> {
  const [row] = await db.select({ metadata: organization.metadata, name: organization.name }).from(organization).where(eq(organization.id, organizationId));
  const branding = parseBranding(row?.metadata ?? null);
  return branding.agencyName ? branding : { ...branding, agencyName: row?.name ?? "" };
}

export async function saveBranding(organizationId: string, branding: AgencyBranding) {
  const [row] = await db.select({ metadata: organization.metadata }).from(organization).where(eq(organization.id, organizationId));
  await db.update(organization).set({ metadata: mergeBranding(row?.metadata ?? null, branding) }).where(eq(organization.id, organizationId));
}

const MAX_LOGO_BYTES = 512 * 1024;

/** Inline a stored logo so the report document has no external references. */
export async function logoDataUri(key: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    const head = await headObject(key);
    if (!head || head.bytes > MAX_LOGO_BYTES) return null;
    const buf = await getObjectBuffer(key);
    return `data:${head.contentType};base64,${buf.toString("base64")}`;
  } catch (err) {
    log.warn("report logo unavailable", { key, err });
    return null;
  }
}
