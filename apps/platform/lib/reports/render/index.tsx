/*
 * HTML rendering entry points. `renderToStaticMarkup` is used deliberately:
 * the output is a document, not an app — no hydration markers, no scripts.
 * Runs in the worker, so nothing here may touch next/headers or server-only.
 */
// React is imported explicitly: the worker transpiles these files with the classic JSX runtime.
import React from "react";
import type { ReportDocument, RollupDocument } from "../document";
import { Appendix, InsightsSection, PaidSectionView, ServiceSection } from "./appendix";
import { RollupBody } from "./rollup";
import { ChannelMixSection, Cover, Scorecard, TopPosts, Trend } from "./sections";
import { DocumentFooter, DocumentShell, staticMarkup } from "./shell";

const DOCTYPE = "<!doctype html>";

export async function renderReportHtml(doc: ReportDocument): Promise<string> {
  const markup = await staticMarkup(
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

export async function renderRollupHtml(doc: RollupDocument): Promise<string> {
  const markup = await staticMarkup(
    <DocumentShell title={doc.meta.title}>
      <RollupBody doc={doc} />
      <Appendix appendix={doc.appendix} />
      <DocumentFooter brand={doc.brand} generatedAt={doc.meta.generatedAt} />
    </DocumentShell>,
  );
  return `${DOCTYPE}${markup}`;
}
