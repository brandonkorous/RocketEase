import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { brandPath } from "@/lib/brand/sections";
import { pdfConfigured } from "@/lib/reports/pdf";
import { CopyBrandDialog, type CopySource } from "./copy-dialog";

/**
 * Header actions from the brand-kit mockup: export the kit (HTML always; PDF
 * when a renderer is configured) and, for editors, copy from another workspace.
 */
export function BrandHeaderActions({ workspaceId, canEdit, sources }: { workspaceId: string; canEdit: boolean; sources: CopySource[] }) {
  const pdf = pdfConfigured();
  const href = `${brandPath(workspaceId)}/export`;
  return (
    <>
      {canEdit && sources.length > 0 && <CopyBrandDialog workspaceId={workspaceId} sources={sources} />}
      {pdf ? (
        <>
          <a href={href} className={buttonClasses({ variant: "outline", color: "neutral" })}>Export HTML</a>
          <a href={`${href}?format=pdf`} className={buttonClasses({ color: "primary" })}>Export PDF</a>
        </>
      ) : (
        <a href={href} className={buttonClasses({ color: "primary" })} title="One self-contained HTML file. PDF export needs a renderer on this deployment; the HTML file prints to PDF from any browser.">Export brand kit</a>
      )}
    </>
  );
}
