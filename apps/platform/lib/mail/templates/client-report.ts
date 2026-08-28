/*
 * Client-facing report mail. Branded from the agency's settings, and the only
 * mail path that may reach an address outside the tenant — which is why the
 * opt-in template exists and why delivery checks verification at run time.
 */
import { APP_NAME, brandedLayout, button, esc } from "./layout";

type Brand = { name: string; logoDataUri?: string | null; footerText?: string | null };

export const CLIENT_REPORT_TEMPLATES = {
  client_report: (d: { brand: Brand; reportName: string; period: string; url: string; expiresLabel: string }) => ({
    subject: `${d.reportName} — ${d.period}`,
    html: brandedLayout(
      d.brand,
      d.reportName,
      `<p>Your report for <strong>${esc(d.period)}</strong> is ready.</p>${button(d.url, "View the report")}<p style="font-size:13px;color:#737373">This link works until ${esc(d.expiresLabel)}.</p>`,
    ),
    text: `${d.reportName} — ${d.period}\n\nView the report: ${d.url}\nThis link works until ${d.expiresLabel}.`,
  }),
  "report.verify_recipient": (d: { brand: Brand; workspaceName: string; requestedBy: string; url: string }) => ({
    subject: `Confirm you want reports for ${d.workspaceName}`,
    html: brandedLayout(
      d.brand,
      "Confirm your report emails",
      `<p>${esc(d.requestedBy)} asked to send you scheduled reports for <strong>${esc(d.workspaceName)}</strong> from ${APP_NAME}.</p><p>Nothing is sent until you confirm.</p>${button(d.url, "Yes, send me these reports")}<p style="font-size:13px;color:#737373">This confirmation link expires in 7 days. If you weren't expecting it, ignore this email and no reports will be sent.</p>`,
    ),
    text: `${d.requestedBy} asked to send you scheduled reports for ${d.workspaceName}. Confirm: ${d.url}\nIf you weren't expecting this, ignore it — nothing will be sent.`,
  }),
} as const;
