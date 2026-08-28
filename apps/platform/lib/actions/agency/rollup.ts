"use server";

import { randomBytes } from "node:crypto";
import { shiftDay } from "@/lib/analytics/periods";
import { audit } from "@/lib/audit";
import { buildRollupDocument, rollupWorkspaces } from "@/lib/reports/rollup";
import { renderRollupHtml } from "@/lib/reports/render";
import { listUserWorkspaces } from "@/lib/session";
import { presignGet, putObject } from "@/lib/storage";
import { dayKey } from "@/lib/time";
import { fail, guard, type ActionState } from "@/lib/actions/content/shared";
import { requireOrgMember } from "./shared";

const WINDOW_DAYS = 28;

/**
 * One document covering every client workspace the caller can already see.
 * Per-workspace sections only — analytics.md forbids combined currency totals
 * across clients, so none are produced.
 */
export async function generateAgencyRollup(organizationId: string): Promise<ActionState & { url?: string }> {
  return guard(async () => {
    const ctx = await requireOrgMember(organizationId);
    const mine = (await listUserWorkspaces(ctx.userId)).filter((w) => w.organizationId === organizationId);
    if (mine.length === 0) return fail("You are not a member of any workspace in this organization yet.");
    const tz = mine[0].timezone;
    const to = shiftDay(dayKey(new Date(), tz), -1);
    const filters = { from: shiftDay(to, -(WINDOW_DAYS - 1)), to, compare: "previous" as const, scope: "all" as const };
    const workspaces = await rollupWorkspaces(mine.map((w) => w.id));
    const doc = await buildRollupDocument({ organizationId, organizationName: ctx.organizationName, workspaces, filters, title: "Agency overview", timezone: tz });
    const html = renderRollupHtml(doc);
    const key = `org/${organizationId}/rollups/${new Date().toISOString().slice(0, 10)}-${randomBytes(8).toString("hex")}.html`;
    await putObject(key, Buffer.from(html, "utf8"), "text/html; charset=utf-8");
    await audit({ action: "report.agency_rollup", actorUserId: ctx.userId, organizationId, targetType: "organization", targetId: organizationId, summary: { after: { workspaces: workspaces.length, from: filters.from, to: filters.to } } });
    const url = await presignGet(key, 3600, "agency-overview.html");
    return { ok: `Agency overview ready for ${workspaces.length} client${workspaces.length === 1 ? "" : "s"}.`, url };
  });
}
