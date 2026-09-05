import type { Metadata } from "next";
import { AppPage, PageHeader } from "@/components/page-frame";
import { BrandHeaderActions } from "@/components/brand/header-actions";
import { BrandSectionNav } from "@/components/brand/section-nav";
import { hasCapability, requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Brand" };

/**
 * The brand hub. Everything a post, an ad, or a client report needs to sound
 * and look like this brand — first-level navigation because it is an input to
 * the work, not a setting people visit once.
 */
export default async function BrandLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await requireWorkspace(workspaceId);
  // Copy sources: every other workspace this person belongs to (membership is re-checked in the action).
  const sources = ctx.workspaces.filter((w) => w.id !== workspaceId).map((w) => ({ id: w.id, name: w.name, organizationName: w.organizationName }));
  return (
    <AppPage>
      <PageHeader title="Brand" description={ctx.workspace.name} actions={<BrandHeaderActions workspaceId={workspaceId} canEdit={hasCapability(ctx.workspace, "workspace.settings")} sources={sources} />} />
      <div className="mt-8 grid gap-8 md:grid-cols-[220px_1fr]">
        <BrandSectionNav workspaceId={workspaceId} />
        <div className="min-w-0">{children}</div>
      </div>
    </AppPage>
  );
}
