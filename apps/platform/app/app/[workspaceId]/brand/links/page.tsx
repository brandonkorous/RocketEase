import type { Metadata } from "next";
import { BioEditor } from "@/components/bio/editor";
import { appUrl, loadBioEditor } from "@/lib/bio/queries";
import { displayUrl } from "@/lib/bio/rules";
import { BRAND_TOOLS } from "@/lib/brand/sections";
import { hasCapability, requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Link in bio" };

/** A Brand tool, not a kit section: the page is built FROM the kit, so it lives beside it (M14.5). */
export default async function LinkInBioPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await requireWorkspace(workspaceId);
  const tool = BRAND_TOOLS[0];
  const data = await loadBioEditor({ workspaceId, workspaceName: ctx.workspace.name, canEdit: hasCapability(ctx.workspace, "workspace.settings") });
  return (
    <section aria-labelledby="bio-title" className="min-w-0">
      <h2 id="bio-title" className="text-xl font-bold tracking-tight">{tool.label}</h2>
      <p className="mt-1 text-sm text-secondary">{tool.blurb}</p>
      <BioEditor data={data} host={displayUrl(appUrl())} />
    </section>
  );
}
