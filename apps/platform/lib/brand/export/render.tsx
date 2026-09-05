/*
 * The brand kit as one self-contained HTML file, on the same document shell
 * as client reports. Empty parts of the kit read "Not recorded yet" — a brand
 * book that invents a value is worse than one with a gap.
 */
import React from "react"; // the shell's documents use the classic JSX runtime
import { DocumentShell, staticMarkup } from "@/lib/reports/render/shell";
import type { BrandDocument } from "./document";
import { AudiencesSection, Cover, IdentitySection, MessagingSection, RulesSection, VoiceSection } from "./sections";
import { AssetsSection, ChannelsSection, VisualSection } from "./visual";

const DOCTYPE = "<!doctype html>";

/** Swatches are the one place colour appears: it is the brand's own palette, i.e. content, not decoration. */
const CSS = `
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.swatch{border:1px solid #e5e5e5;border-radius:10px;overflow:hidden}
.swatch .chip{height:64px}
.swatch .k{padding:8px 10px;font-size:12px;color:#525252}
.swatch .k b{display:block;font-size:13px;color:#0a0a0a}
.logos{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.logo{border:1px solid #e5e5e5;border-radius:10px;padding:14px;text-align:center;font-size:12px;color:#525252}
.logo img{max-width:100%;max-height:72px;display:block;margin:0 auto 8px}
.logo.dark{background:#0a0a0a;color:#d4d4d4}
.two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 32px}
.quote{border-left:3px solid #0a0a0a;padding:2px 0 2px 12px;margin:8px 0;white-space:pre-wrap}
.tags span{display:inline-block;border:1px solid #e5e5e5;border-radius:999px;padding:2px 10px;font-size:12px;margin:0 6px 6px 0}
`;

export async function renderBrandKitHtml(doc: BrandDocument): Promise<string> {
  const markup = await staticMarkup(
    <DocumentShell title={doc.meta.title} extraCss={CSS}>
      <Cover doc={doc} />
      <IdentitySection doc={doc} />
      <VoiceSection doc={doc} />
      <VisualSection doc={doc} />
      <MessagingSection doc={doc} />
      <AudiencesSection doc={doc} />
      <RulesSection doc={doc} />
      <ChannelsSection doc={doc} />
      <AssetsSection doc={doc} />
      <footer>
        <p>Prepared by {doc.preparedBy.name}.</p>
        <p>Generated {doc.meta.generatedAt} ({doc.meta.timezone}) from the {doc.meta.workspaceName} workspace in RocketEase. A part of the kit nobody has filled in reads “Not recorded yet”; nothing here is inferred.</p>
      </footer>
    </DocumentShell>,
  );
  return `${DOCTYPE}${markup}`;
}
