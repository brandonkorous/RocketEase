"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reportShare } from "@/db/schema/analytics";
import { audit } from "@/lib/audit";
import { workspacePath } from "@/lib/nav";
import { createShare } from "@/lib/reports/deliver";
import { DEFAULT_SHARE_DAYS, MAX_SHARE_DAYS, hashPasscode } from "@/lib/reports/share";
import { requireCapability } from "@/lib/session";
import { fail, guard, type ActionState } from "./content/shared";

const schema = z.object({
  runId: z.string().min(1),
  days: z.number().int().min(1).max(MAX_SHARE_DAYS).default(DEFAULT_SHARE_DAYS),
  passcode: z.string().max(64).default(""),
});
export type ShareInput = z.infer<typeof schema>;

/**
 * Mint a client link for one generated report. The token is returned once and
 * never stored in the clear; the URL carries no workspace or organization id.
 */
export async function createReportShare(workspaceId: string, input: ShareInput): Promise<ActionState & { url?: string; expiresAt?: string }> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "reports.export");
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail("Check the expiry and passcode.");
    const { runId, days, passcode } = parsed.data;
    if (passcode && passcode.trim().length < 4) return fail("A passcode needs at least 4 characters.");
    const run = await db.query.reportRun.findFirst({ where: (r, { and, eq }) => and(eq(r.id, runId), eq(r.workspaceId, workspaceId)) });
    if (!run || run.status !== "done" || !run.objectKey) return fail("That report has no generated file to share yet.");
    const share = await createShare({
      run: { id: run.id, name: run.name, organizationId: run.organizationId, workspaceId },
      days,
      passcodeHash: passcode ? hashPasscode(passcode.trim()) : null,
      createdByUserId: ctx.session.user.id,
    });
    await audit({ action: "report.share_create", actorUserId: ctx.session.user.id, organizationId: run.organizationId, workspaceId, targetType: "report_run", targetId: run.id, summary: { after: { shareId: share.id, expiresAt: share.expiresAt.toISOString(), passcode: Boolean(passcode) } } });
    revalidatePath(workspacePath(workspaceId, "reports"));
    return { ok: "Share link created.", url: share.url, expiresAt: share.expiresAt.toISOString() };
  });
}

/** Cut access off immediately. Revocation is permanent; a new link must be minted. */
export async function revokeReportShare(workspaceId: string, shareId: string): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireCapability(workspaceId, "reports.export");
    const [row] = await db
      .update(reportShare)
      .set({ revokedAt: new Date(), revokedByUserId: ctx.session.user.id })
      .where(and(eq(reportShare.id, shareId), eq(reportShare.workspaceId, workspaceId), isNull(reportShare.revokedAt)))
      .returning({ id: reportShare.id, runId: reportShare.runId });
    if (!row) return fail("That link is already revoked or does not exist.");
    await audit({ action: "report.share_revoke", actorUserId: ctx.session.user.id, organizationId: ctx.workspace.organizationId, workspaceId, targetType: "report_run", targetId: row.runId, summary: { after: { shareId: row.id } } });
    revalidatePath(workspacePath(workspaceId, "reports"));
    return { ok: "Link revoked. Anyone holding it now sees a revoked notice." };
  });
}

/** Shares for one run, for the Share popover. */
export async function listReportShares(workspaceId: string, runId: string) {
  await requireCapability(workspaceId, "reports.export");
  const rows = await db
    .select({ id: reportShare.id, expiresAt: reportShare.expiresAt, revokedAt: reportShare.revokedAt, viewCount: reportShare.viewCount, lastViewedAt: reportShare.lastViewedAt, hasPasscode: reportShare.passcodeHash })
    .from(reportShare)
    .where(and(eq(reportShare.workspaceId, workspaceId), eq(reportShare.runId, runId)))
    .orderBy(reportShare.createdAt);
  return rows.map((r) => ({ id: r.id, expiresAt: r.expiresAt.toISOString(), revokedAt: r.revokedAt?.toISOString() ?? null, viewCount: r.viewCount, lastViewedAt: r.lastViewedAt?.toISOString() ?? null, hasPasscode: Boolean(r.hasPasscode) }));
}
