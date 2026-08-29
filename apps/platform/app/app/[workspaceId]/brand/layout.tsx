import type { Metadata } from "next";
import { AppPage, PageHeader } from "@/components/page-frame";
import { BrandSectionNav } from "@/components/brand/section-nav";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Brand" };

/**
 * The brand hub. Everything a post, an ad, or a client report needs to sound
 * and look like this brand — first-level navigation because it is an input to
 * the work, not a setting people visit once.
 */
export default async function BrandLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await requireWorkspace(workspaceId);
  return (
    <AppPage>
      <PageHeader title="Brand" description={ctx.workspace.name} />
      <div className="mt-8 grid gap-8 md:grid-cols-[220px_1fr]">
        <BrandSectionNav workspaceId={workspaceId} />
        <div className="min-w-0">{children}</div>
      </div>
    </AppPage>
  );
}
