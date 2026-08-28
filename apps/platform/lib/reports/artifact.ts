/*
 * Turn one report run into stored artifacts. CSV stays the analyst export;
 * HTML is the branded client document, with a PDF beside it only when a real
 * renderer is configured (see pdf.ts).
 */
import type { ReportFilters, ReportFormat } from "@/db/schema/analytics";
import { buildCsv } from "@/lib/analytics/export";
import { putObject } from "@/lib/storage";
import { buildReportDocument, type ReportWorkspace } from "./build";
import { renderPdf } from "./pdf";
import { renderReportHtml } from "./render";

export type BuiltArtifact = {
  key: string;
  bytes: number;
  format: ReportFormat;
  extension: "csv" | "html";
  contentType: string;
  /** Present only when a Chromium renderer produced one. */
  pdfKey: string | null;
};

export type ArtifactInput = {
  runId: string;
  name: string;
  workspace: ReportWorkspace;
  filters: ReportFilters;
  format: ReportFormat;
  generatedBy: string;
};

const prefix = (ws: ReportWorkspace, runId: string) => `${ws.organizationId}/${ws.id}/reports/${runId}`;

export async function buildAndStoreArtifact(input: ArtifactInput): Promise<BuiltArtifact> {
  const { workspace: ws, filters, runId } = input;
  if (input.format === "csv") {
    const csv = await buildCsv({ workspaceId: ws.id, workspaceName: ws.name, timezone: ws.timezone, filters, generatedBy: input.generatedBy });
    const key = `${prefix(ws, runId)}.csv`;
    await putObject(key, Buffer.from(csv, "utf8"), "text/csv");
    return { key, bytes: Buffer.byteLength(csv), format: "csv", extension: "csv", contentType: "text/csv", pdfKey: null };
  }
  const doc = await buildReportDocument({ workspace: ws, filters, title: input.name });
  const html = renderReportHtml(doc);
  const key = `${prefix(ws, runId)}.html`;
  await putObject(key, Buffer.from(html, "utf8"), "text/html; charset=utf-8");
  const pdf = await renderPdf(html);
  let pdfKey: string | null = null;
  if (pdf) {
    pdfKey = `${prefix(ws, runId)}.pdf`;
    await putObject(pdfKey, pdf.buffer, "application/pdf");
  }
  return { key, bytes: Buffer.byteLength(html), format: "html", extension: "html", contentType: "text/html; charset=utf-8", pdfKey };
}
