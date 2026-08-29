import { notFound } from "next/navigation";
import { BRAND_SECTIONS } from "@/lib/brand/sections";
import type { BrandSection } from "@/lib/brand/schema";
import { hasCapability, requireWorkspace } from "@/lib/session";
import { loadBrandSection } from "./load";
import { BrandSectionBody } from "./section-body";

export default async function BrandSectionPage({ params }: { params: Promise<{ workspaceId: string; section: string }> }) {
  const { workspaceId, section } = await params;
  const current = BRAND_SECTIONS.find((s) => s.slug === section);
  if (!current) notFound();
  const ctx = await requireWorkspace(workspaceId);
  const data = await loadBrandSection(current.slug as BrandSection, workspaceId);

  return (
    <section aria-labelledby="brand-section-title" className="min-w-0">
      <h2 id="brand-section-title" className="text-xl font-bold tracking-tight">{current.label}</h2>
      <p className="mt-1 text-sm text-secondary">{current.blurb}</p>
      <BrandSectionBody section={current.slug as BrandSection} workspaceId={workspaceId} canEdit={hasCapability(ctx.workspace, "workspace.settings")} data={data} />
    </section>
  );
}
