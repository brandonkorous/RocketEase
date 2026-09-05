/*
 * Document shell for branded reports: one self-contained HTML file with
 * inline CSS, inline SVG and base64 logos — no external requests, so it
 * renders the same in an email client, a browser and a PDF engine.
 *
 * Monochrome by rule (design.md): black, white and structure. The only colour
 * comes from social network series in the charts.
 */
import React from "react"; // see index.tsx: the worker uses the classic JSX runtime
import type { ReportBrand } from "../document";

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#0a0a0a;font:15px/1.55 Inter,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:960px;margin:0 auto;padding:40px 32px 64px}
h1{font-size:30px;line-height:1.15;letter-spacing:-0.02em;margin:0 0 6px}
h2{font-size:18px;letter-spacing:-0.01em;margin:0 0 4px}
h3{font-size:13px;text-transform:uppercase;letter-spacing:0.06em;color:#525252;margin:0 0 10px;font-weight:600}
p{margin:0 0 8px}
section{margin-top:36px;page-break-inside:avoid}
.muted{color:#525252}
.small{font-size:12px;line-height:1.5}
.cover{border-bottom:2px solid #0a0a0a;padding-bottom:24px}
.brandrow{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:28px}
.brandrow img{max-height:44px;max-width:190px;display:block}
.brandname{font-weight:700;font-size:15px}
.metagrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 32px;margin-top:18px}
.metagrid div{border-top:1px solid #e5e5e5;padding-top:8px}
.metagrid dt{font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#737373;margin-bottom:2px}
.metagrid dd{margin:0;font-weight:600;font-size:14px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#737373;font-weight:600;padding:0 8px 8px 0;border-bottom:1px solid #e5e5e5}
td{padding:9px 8px 9px 0;border-bottom:1px solid #f5f5f5;vertical-align:top}
td.num,th.num{text-align:right;padding-right:0;font-variant-numeric:tabular-nums}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.card{border:1px solid #e5e5e5;border-radius:10px;padding:14px}
.card .k{font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#737373}
.card .v{font-size:26px;font-weight:700;letter-spacing:-0.02em;margin:4px 0 2px;font-variant-numeric:tabular-nums}
.card .d{font-size:12px;color:#525252}
.card .def{font-size:11px;color:#737373;margin-top:8px;border-top:1px solid #f5f5f5;padding-top:8px}
.note{border-left:3px solid #0a0a0a;padding:2px 0 2px 12px;margin:12px 0;font-size:13px}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:#525252;margin-top:8px}
.legend span.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
.chartwrap{overflow-x:auto}
ul.plain{margin:0;padding-left:18px}
ul.plain li{margin-bottom:6px}
.appendix td,.appendix th{font-size:12px}
footer{margin-top:48px;border-top:1px solid #e5e5e5;padding-top:14px;font-size:11px;color:#737373}
a{color:#0a0a0a}
@page{margin:14mm}
@media print{.page{padding:0}}
`;

/** Loaded at runtime (Node resolves it): Next refuses a static react-dom/server import inside the app graph, and these documents are files, not pages. */
export async function staticMarkup(el: React.ReactElement): Promise<string> {
  const mod = (await import(/* webpackIgnore: true */ "react-dom/server")) as typeof import("react-dom/server");
  return mod.renderToStaticMarkup(el);
}

/** `extraCss` lets another document (the brand kit) add its own classes without forking the shell. */
export function DocumentShell({ title, children, extraCss }: { title: string; children: React.ReactNode; extraCss?: string }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        {extraCss && <style dangerouslySetInnerHTML={{ __html: extraCss }} />}
      </head>
      <body>
        <div className="page">{children}</div>
      </body>
    </html>
  );
}

/** Cover masthead: agency identity on the left, client on the right (or the client alone when white-labelled to them). */
export function BrandRow({ brand }: { brand: ReportBrand }) {
  const agency = brand.usesClientBrand ? null : brand;
  const left = agency?.agencyName || brand.clientName;
  // A roll-up (or a client whose own brand is on the report) has one identity, not two.
  const showClient = brand.clientName !== left;
  return (
    <div className="brandrow">
      <div>{agency?.agencyLogo ? <img src={agency.agencyLogo} alt={left || "Agency"} /> : <span className="brandname">{left}</span>}</div>
      {showClient && (
        <div style={{ textAlign: "right" }}>
          {brand.clientLogo ? <img src={brand.clientLogo} alt={brand.clientName} style={{ marginLeft: "auto" }} /> : <span className="brandname">{brand.clientName}</span>}
        </div>
      )}
    </div>
  );
}

export function DocumentFooter({ brand, generatedAt }: { brand: ReportBrand; generatedAt: string }) {
  const who = brand.usesClientBrand ? brand.clientName : brand.agencyName || brand.clientName;
  return (
    <footer>
      <p>{brand.footerText || `Prepared by ${who}.`}</p>
      <p>Generated {generatedAt}. Figures come from the connected accounts named in the appendix; where a source is missing the value reads “—”, never zero.</p>
    </footer>
  );
}
