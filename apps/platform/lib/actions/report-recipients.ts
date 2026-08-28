"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { externalRecipient } from "@/db/schema/analytics";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/jobs/outbox";
import { workspacePath } from "@/lib/nav";
import { loadBranding, logoDataUri } from "@/lib/reports/branding";
import { appUrl } from "@/lib/reports/deliver";
import { hashToken, mintShareToken } from "@/lib/reports/share";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "./content/shared";

const VERIFY_DAYS = 7;
const emailSchema = z.string().email().max(160);

export type ExternalRecipientRow = { id: string; email: string; status: string; verifiedAt: string | null; sentAt: string | null };

export async function listExternalRecipients(workspaceId: string): Promise<ExternalRecipientRow[]> {
  await requireCapability(workspaceId, "reports.export");
  const rows = await db.select().from(externalRecipient).where(eq(externalRecipient.workspaceId, workspaceId)).orderBy(externalRecipient.email);
  return rows.map((r) => ({ id: r.id, email: r.email, status: r.unsubscribedAt ? "unsubscribed" : r.status, verifiedAt: r.verifiedAt?.toISOString() ?? null, sentAt: r.verificationSentAt?.toISOString() ?? null }));
}

/**
 * Invite an address outside the workspace to receive client reports. Nothing
 * is ever sent to it until the recipient confirms from the opt-in email — a
 * pending row is never delivered to (lib/reports/recipients.ts).
 */
export async function inviteExternalRecipient(workspaceId: string, email: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "reports.export");
    const parsed = emailSchema.safeParse(email.trim().toLowerCase());
    if (!parsed.success) return fail("Enter a valid email address.");
    const address = parsed.data;
    const { token } = mintShareToken();
    const now = new Date();
    const expires = new Date(now.getTime() + VERIFY_DAYS * 86_400_000);
    const values = { organizationId: ctx.workspace.organizationId, workspaceId, email: address, status: "pending" as const, verificationTokenHash: hashToken(token), verificationSentAt: now, verificationExpiresAt: expires, requestedByUserId: ctx.session.user.id };
    await db
      .insert(externalRecipient)
      .values(values)
      .onConflictDoUpdate({ target: [externalRecipient.workspaceId, externalRecipient.email], set: { status: "pending", verificationTokenHash: values.verificationTokenHash, verificationSentAt: now, verificationExpiresAt: expires, unsubscribedAt: null, requestedByUserId: ctx.session.user.id } });
    await sendOptIn({ organizationId: ctx.workspace.organizationId, workspaceId, workspaceName: ctx.workspace.name, to: address, token, requestedBy: ctx.session.user.name || ctx.session.user.email });
    await audit({ action: "report.recipient_invite", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "external_recipient", targetId: address, summary: { after: { status: "pending" } } });
    revalidatePath(workspacePath(workspaceId, "reports"));
    return { ok: `Opt-in email sent to ${address}. Nothing is delivered until they confirm.` };
  });
}

async function sendOptIn(input: { organizationId: string; workspaceId: string; workspaceName: string; to: string; token: string; requestedBy: string }) {
  const branding = await loadBranding(input.organizationId);
  const usesClient = branding.clientBrand[input.workspaceId] === true;
  const logo = await logoDataUri(usesClient ? null : branding.logoKey);
  const brand = { name: usesClient ? input.workspaceName : branding.agencyName || input.workspaceName, logoDataUri: logo, footerText: branding.footerText || null };
  const url = `${appUrl()}/r/confirm/${input.token}`;
  await db.transaction(async (tx) => {
    await emit(
      tx,
      "mail.send",
      { to: input.to, template: "report.verify_recipient", data: { brand, workspaceName: input.workspaceName, requestedBy: input.requestedBy, url }, organizationId: input.organizationId, replyTo: branding.replyTo || undefined },
      { organizationId: input.organizationId, workspaceId: input.workspaceId },
    );
  });
}

export async function removeExternalRecipient(workspaceId: string, id: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "reports.export");
    const [row] = await db.delete(externalRecipient).where(and(eq(externalRecipient.id, id), eq(externalRecipient.workspaceId, workspaceId))).returning({ email: externalRecipient.email });
    if (!row) return fail("That recipient no longer exists.");
    await audit({ action: "report.recipient_remove", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "external_recipient", targetId: row.email });
    revalidatePath(workspacePath(workspaceId, "reports"));
    return { ok: `${row.email} will no longer receive reports.` };
  });
}
