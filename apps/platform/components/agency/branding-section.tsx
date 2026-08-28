import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { member } from "@/db/schema/auth";
import { loadBranding } from "@/lib/reports/branding";
import { presignGet } from "@/lib/storage";
import { BrandingForm } from "./branding-form";
import { ClientBrandToggle } from "./client-brand-toggle";
import { RollupButton } from "./rollup-button";

type Client = { id: string; name: string };

/** Org-level branding: the only settings on the agency surface, and the only place they belong. */
export async function BrandingSection({ organizationId, userId, clients }: { organizationId: string; userId: string; clients: Client[] }) {
  const [branding, [role]] = await Promise.all([
    loadBranding(organizationId),
    db.select({ role: member.role }).from(member).where(and(eq(member.organizationId, organizationId), eq(member.userId, userId))).limit(1),
  ]);
  const canEdit = ["owner", "admin"].includes(role?.role ?? "");
  const logoUrl = branding.logoKey ? await presignGet(branding.logoKey, 600).catch(() => null) : null;

  return (
    <section className="mt-10 rounded-box border border-base-300 p-5" aria-labelledby="branding-h">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="branding-h" className="text-sm font-semibold">
            Branding
          </h2>
          <p className="mt-1 max-w-160 text-sm text-secondary">
            What clients see on reports you share with them. {canEdit ? "" : "Only organization owners and admins can change this."}
          </p>
        </div>
        <RollupButton organizationId={organizationId} />
      </div>

      <div className="mt-5">
        <BrandingForm organizationId={organizationId} initial={{ agencyName: branding.agencyName, footerText: branding.footerText, replyTo: branding.replyTo, logoUrl }} canEdit={canEdit} />
      </div>

      {clients.length > 0 && (
        <div className="mt-6 border-t border-base-300 pt-4">
          <h3 className="text-xs font-semibold text-secondary">Per-client brand</h3>
          <p className="mt-1 max-w-160 text-xs text-secondary/70">A client can have their own logo and name on their reports instead of yours. The client&rsquo;s brand comes from that workspace&rsquo;s Brand settings.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-field border border-base-300 px-3 py-2">
                <span className="truncate text-sm">{c.name}</span>
                <ClientBrandToggle organizationId={organizationId} workspaceId={c.id} checked={branding.clientBrand[c.id] === true} disabled={!canEdit} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
