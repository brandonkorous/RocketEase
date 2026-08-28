/*
 * Optional PDF rendering.
 *
 * The HTML document is the artifact of record. A PDF is produced only when a
 * real Chromium is configured (REPORT_CHROMIUM_PATH) and puppeteer-core is
 * installed; otherwise this returns null and the UI says so plainly. We never
 * ship a fake PDF or a renamed HTML file.
 */
import { log } from "@/lib/log";

export type PdfResult = { buffer: Buffer } | null;

/** True when the deployment is configured to render PDFs. */
export const pdfConfigured = () => Boolean(process.env.REPORT_CHROMIUM_PATH);

export const PDF_UNAVAILABLE_NOTE = "PDF export becomes available once a Chromium renderer is configured for this deployment (REPORT_CHROMIUM_PATH). The HTML document below is the artifact of record.";

type Browser = { newPage: () => Promise<Page>; close: () => Promise<void> };
type Page = { setContent: (html: string, o: unknown) => Promise<void>; pdf: (o: unknown) => Promise<Uint8Array> };

export async function renderPdf(html: string): Promise<PdfResult> {
  const executablePath = process.env.REPORT_CHROMIUM_PATH;
  if (!executablePath) return null;
  const specifier = process.env.REPORT_PDF_MODULE ?? "puppeteer-core";
  let browser: Browser | null = null;
  try {
    const mod = await import(specifier);
    const launch = (mod.default ?? mod).launch as (o: unknown) => Promise<Browser>;
    browser = await launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"], headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const bytes = await page.pdf({ format: "A4", printBackground: true, margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" } });
    return { buffer: Buffer.from(bytes) };
  } catch (err) {
    log.warn("PDF render unavailable", { err: String(err) });
    return null;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
