/*
 * HTML rendering entry points. `renderToStaticMarkup` is used deliberately:
 * the output is a document, not an app — no hydration markers, no scripts.
 * Runs in the worker, so nothing here may touch next/headers or server-only.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ReportDocument, RollupDocument } from "../document";
import { Appendix, InsightsSection, PaidSectionView, ServiceSection } from "./appendix";
import { RollupBody } from "./rollup";
import { ChannelMixSection, Cover, Scorecard, TopPosts, Trend } from "./sections";
import { DocumentFooter, DocumentShell } from "./shell";

const DOCTYPE = "<!doctype html>";

export function renderReportHtml(doc: ReportDocument): string {
  const markup = renderToStaticMarkup(
    <DocumentShell title={`${doc.meta.title} — ${doc.brand.clientName}`}>
      <Cover doc={doc} />
      <Scorecard doc={doc} />
      <Trend doc={doc} />
      <ChannelMixSection doc={doc} />
      <TopPosts doc={doc} />
      <ServiceSection doc={doc} />
      <PaidSectionView doc={doc} />
      <InsightsSection doc={doc} />
      <Appendix appendix={doc.appendix} />
      <DocumentFooter brand={doc.brand} generatedAt={doc.meta.generatedAt} />
    </DocumentShell>,
  );
  return `${DOCTYPE}${markup}`;
}

export function renderRollupHtml(doc: RollupDocument): string {
  const markup = renderToStaticMarkup(
    <DocumentShell title={doc.meta.title}>
      <RollupBody doc={doc} />
      <Appendix appendix={doc.appendix} />
      <DocumentFooter brand={doc.brand} generatedAt={doc.meta.generatedAt} />
    </DocumentShell>,
  );
  return `${DOCTYPE}${markup}`;
}
