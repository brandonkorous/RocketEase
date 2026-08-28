/*
 * Agency branding, parsing only.
 *
 * Kept free of database, storage and node builtins so a client component can
 * import the shape and the defaults (the same rule share-config.ts follows).
 */
export type AgencyBranding = {
  agencyName: string;
  /** Object key of the agency logo in STORAGE_BUCKET (org-scoped prefix). */
  logoKey: string | null;
  footerText: string;
  replyTo: string;
  /** Per-client: show the client's own brand instead of the agency's. */
  clientBrand: Record<string, boolean>;
};

export const EMPTY_BRANDING: AgencyBranding = { agencyName: "", logoKey: null, footerText: "", replyTo: "", clientBrand: {} };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Tolerant read: unknown or malformed metadata yields the empty branding. */
export function parseBranding(metadata: string | null): AgencyBranding {
  if (!metadata) return EMPTY_BRANDING;
  try {
    const raw = (JSON.parse(metadata) as Record<string, unknown>).agencyBranding as Record<string, unknown> | undefined;
    if (!raw) return EMPTY_BRANDING;
    const toggles = (raw.clientBrand ?? {}) as Record<string, unknown>;
    return {
      agencyName: str(raw.agencyName, 80),
      logoKey: typeof raw.logoKey === "string" ? raw.logoKey : null,
      footerText: str(raw.footerText, 300),
      replyTo: str(raw.replyTo, 160),
      clientBrand: Object.fromEntries(Object.entries(toggles).filter(([, v]) => typeof v === "boolean")) as Record<string, boolean>,
    };
  } catch {
    return EMPTY_BRANDING;
  }
}

/** Merge branding back into the organization's metadata without dropping other keys. */
export function mergeBranding(metadata: string | null, branding: AgencyBranding): string {
  let base: Record<string, unknown> = {};
  try {
    if (metadata) base = JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    base = {};
  }
  return JSON.stringify({ ...base, agencyBranding: branding });
}

/** Object key for an agency logo. Org-scoped so it can never be guessed across tenants. */
export const brandingLogoKey = (organizationId: string, ext: string) => `org/${organizationId}/branding/logo-${Date.now()}${ext}`;

/** Client-side brand kept on workspace.settings; absent until Settings → Brand lands. */
export function parseClientBrand(settings: Record<string, unknown>): { logoKey: string | null; displayName: string | null } {
  const raw = (settings.brand ?? {}) as Record<string, unknown>;
  return { logoKey: typeof raw.logoKey === "string" ? raw.logoKey : null, displayName: typeof raw.displayName === "string" ? raw.displayName : null };
}
