/*
 * Delivery for a finished report run.
 *
 * Internal recipients get a short-lived signed storage link. Client-facing
 * reports get a revocable share link instead — clients never receive a URL
 * carrying an organization or workspace id, and the agency can cut access off
 * at any time from Report history.
 */
import { db } from "@/db";
import { appUrl } from "@/lib/app-url";
import { reportShare } from "@/db/schema/analytics";
import { emit } from "@/lib/jobs/outbox";
import { presignGet } from "@/lib/storage";
import { formatInZone } from "@/lib/time";
import { loadBranding, logoDataUri } from "./branding";
import { DEFAULT_SHARE_DAYS, mintShareToken, shareExpiry } from "./share";
import type { ResolvedRecipients } from "./recipients";

export { appUrl } from "@/lib/app-url";
export const shareUrl = (token: string) => `${appUrl()}/r/${token}`;

export type DeliveryInput = {
  run: { id: string; name: string; organizationId: string; workspaceId: string };
  workspace: { id: string; name: string; timezone: string; organizationId: string };
  period: string;
  objectKey: string;
  extension: string;
  clientFacing: boolean;
  recipients: ResolvedRecipients;
};

/** Create a revocable share link for a run (used by delivery and by the Share popover). */
export async function createShare(input: { run: DeliveryInput["run"]; days?: number; passcodeHash?: string | null; createdByUserId?: string | null }) {
  const { token, hash } = mintShareToken();
  const expiresAt = shareExpiry(input.days ?? DEFAULT_SHARE_DAYS);
  const [row] = await db
    .insert(reportShare)
    .values({ organizationId: input.run.organizationId, workspaceId: input.run.workspaceId, runId: input.run.id, tokenHash: hash, passcodeHash: input.passcodeHash ?? null, expiresAt, createdByUserId: input.createdByUserId ?? null })
    .returning({ id: reportShare.id });
  return { id: row.id, token, url: shareUrl(token), expiresAt };
}

/** Enqueue every mail for one finished run. Returns what was actually addressed. */
export async function deliverReport(input: DeliveryInput): Promise<{ delivered: string[]; shareUrl: string | null }> {
  const { recipients, workspace: ws } = input;
  const all = [...recipients.members, ...recipients.external];
  if (all.length === 0) return { delivered: [], shareUrl: null };

  if (!input.clientFacing) {
    const url = await presignGet(input.objectKey, 7 * 86_400, `${input.run.name}.${input.extension}`);
    await db.transaction(async (tx) => {
      for (const to of recipients.members) {
        const data = { name: to, title: `Report "${input.run.name}" (${input.period})`, body: "Your scheduled RocketEase report is ready. The download link is valid for 7 days.", url };
        await emit(tx, "mail.send", { to, template: "notification", data, organizationId: ws.organizationId }, { organizationId: ws.organizationId, workspaceId: ws.id });
      }
    });
    return { delivered: recipients.members, shareUrl: null };
  }

  const branding = await loadBranding(ws.organizationId);
  const usesClient = branding.clientBrand[ws.id] === true;
  const logoDataUriValue = await logoDataUri(usesClient ? null : branding.logoKey);
  const share = await createShare({ run: input.run });
  const brand = { name: usesClient ? ws.name : branding.agencyName || ws.name, logoDataUri: logoDataUriValue, footerText: branding.footerText || null };
  const data = { brand, reportName: input.run.name, period: input.period, url: share.url, expiresLabel: formatInZone(share.expiresAt, ws.timezone, { dateStyle: "medium" }) };
  await db.transaction(async (tx) => {
    for (const to of all) {
      await emit(tx, "mail.send", { to, template: "client_report", data, organizationId: ws.organizationId, replyTo: branding.replyTo || undefined }, { organizationId: ws.organizationId, workspaceId: ws.id });
    }
  });
  return { delivered: all, shareUrl: share.url };
}
