/*
 * Public access path for /r/:token.
 *
 * Order matters: signature → rate limit → database. A forged token never
 * reaches Postgres, and no response distinguishes "unknown token" from
 * "wrong passcode" beyond what the visitor is entitled to know.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { reportRun, reportShare } from "@/db/schema/analytics";
import { workspace } from "@/db/schema/app";
import { audit } from "@/lib/audit";
import { formatInZone } from "@/lib/time";
import { loadBranding, logoDataUri, parseClientBrand } from "./branding";
import { hashToken, isWellFormedToken, shareState, truncateVisitor, type ShareState } from "./share";

export type ShareAccess =
  | { status: "not_found" }
  | { status: Exclude<ShareState, "ok"> }
  | {
      status: "ok";
      shareId: string;
      runId: string;
      runName: string;
      objectKey: string;
      format: string;
      pdfKey: string | null;
      needsPasscode: boolean;
      passcodeHash: string | null;
      expiresLabel: string;
      generatedLabel: string;
      brand: { name: string; logo: string | null; footerText: string };
    };

/** Resolve a token to a viewable run. Never returns tenant identifiers. */
export async function resolveShare(token: string): Promise<ShareAccess> {
  if (!isWellFormedToken(token)) return { status: "not_found" };
  const [row] = await db
    .select({ share: reportShare, run: reportRun, ws: workspace })
    .from(reportShare)
    .innerJoin(reportRun, eq(reportRun.id, reportShare.runId))
    .innerJoin(workspace, eq(workspace.id, reportShare.workspaceId))
    .where(eq(reportShare.tokenHash, hashToken(token)));
  if (!row) return { status: "not_found" };
  const state = shareState(row.share);
  if (state !== "ok") return { status: state };
  if (row.run.status !== "done" || !row.run.objectKey) return { status: "not_found" };

  const branding = await loadBranding(row.ws.organizationId);
  const usesClient = branding.clientBrand[row.ws.id] === true;
  const client = parseClientBrand(row.ws.settings);
  const logo = await logoDataUri(usesClient ? client.logoKey : branding.logoKey);
  const snapshot = row.run.snapshot as { pdfKey?: string | null };
  return {
    status: "ok",
    shareId: row.share.id,
    runId: row.run.id,
    runName: row.run.name,
    objectKey: row.run.objectKey,
    format: row.run.format,
    pdfKey: snapshot.pdfKey ?? null,
    needsPasscode: Boolean(row.share.passcodeHash),
    passcodeHash: row.share.passcodeHash,
    expiresLabel: formatInZone(row.share.expiresAt, row.ws.timezone, { dateStyle: "medium" }),
    generatedLabel: formatInZone(row.run.finishedAt ?? row.run.createdAt, row.ws.timezone),
    brand: { name: usesClient ? client.displayName || row.ws.name : branding.agencyName || row.ws.name, logo, footerText: branding.footerText },
  };
}

/** Count a view and record it in the audit log with a truncated fingerprint. */
export async function recordShareView(shareId: string, visitor: { ip: string | null; userAgent: string | null }) {
  const [row] = await db
    .update(reportShare)
    .set({ viewCount: sql`${reportShare.viewCount} + 1`, lastViewedAt: new Date() })
    .where(eq(reportShare.id, shareId))
    .returning({ organizationId: reportShare.organizationId, workspaceId: reportShare.workspaceId, runId: reportShare.runId });
  if (!row) return;
  const seen = truncateVisitor(visitor.ip, visitor.userAgent);
  await audit({
    action: "report.share_view",
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    targetType: "report_run",
    targetId: row.runId,
    summary: { after: { shareId, ip: seen.ip, userAgent: seen.userAgent } },
  });
}
