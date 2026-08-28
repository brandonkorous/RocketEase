/*
 * Double opt-in confirmation for external report recipients.
 * Public path: no session, so the token itself is the only proof.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { externalRecipient } from "@/db/schema/analytics";
import { audit } from "@/lib/audit";
import { hashToken, isWellFormedToken, truncateVisitor } from "./share";

export type VerifyResult = { status: "ok"; email: string; workspaceName: string } | { status: "invalid" | "expired" };

export async function confirmExternalRecipient(token: string, visitor: { ip: string | null; userAgent: string | null }): Promise<VerifyResult> {
  if (!isWellFormedToken(token)) return { status: "invalid" };
  const row = await db.query.externalRecipient.findFirst({ where: (r, { eq }) => eq(r.verificationTokenHash, hashToken(token)) });
  if (!row) return { status: "invalid" };
  if (row.verificationExpiresAt && row.verificationExpiresAt.getTime() < Date.now()) return { status: "expired" };
  const seen = truncateVisitor(visitor.ip, visitor.userAgent);
  await db
    .update(externalRecipient)
    .set({ status: "verified", verifiedAt: new Date(), verificationTokenHash: null, verifiedFrom: `${seen.ip ?? "unknown"} · ${seen.userAgent ?? "unknown"}`, unsubscribedAt: null })
    .where(eq(externalRecipient.id, row.id));
  await audit({ action: "report.recipient_verified", organizationId: row.organizationId, workspaceId: row.workspaceId, targetType: "external_recipient", targetId: row.email, summary: { after: { from: seen.ip, userAgent: seen.userAgent } } });
  const ws = await db.query.workspace.findFirst({ where: (w, { eq }) => eq(w.id, row.workspaceId) });
  return { status: "ok", email: row.email, workspaceName: ws?.name ?? "your workspace" };
}
