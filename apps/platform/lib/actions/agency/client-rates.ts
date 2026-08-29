"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workspace } from "@/db/schema/app";
import { clientRate } from "@/db/schema/agency";
import { BILLING_MODELS } from "@/lib/agency/margin";
import { audit } from "@/lib/audit";
import { fail, guard, type ActionState } from "@/lib/actions/content/shared";
import { requireOrgAdmin } from "./shared";

const cents = (max: number) => z.number().int().min(0).max(max);
/** 0–1,000,000 bps: a 100x markup is already absurd, so the cap is a typo guard. */
const bps = z.number().int().min(0).max(1_000_000).nullable();

const schema = z.object({
  billingModel: z.enum(BILLING_MODELS),
  currency: z.string().trim().toUpperCase().length(3),
  retainerCents: cents(1_000_000_00).default(0),
  perPostCents: cents(1_000_000_00).nullable().default(null),
  hourlyCents: cents(1_000_000_00).nullable().default(null),
  adSpendMarkupBps: bps.default(null),
  aiCreditMarkupBps: bps.default(null),
  note: z.string().max(500).default(""),
});
export type ClientRateInput = z.input<typeof schema>;

/**
 * What the agency charges this client. Entered by the agency and never
 * inferred: with no rate the Economics table shows revenue and margin as
 * unavailable rather than guessing a number.
 */
export async function setClientRate(organizationId: string, workspaceId: string, input: ClientRateInput): Promise<ActionState> {
  return guard(async () => {
    const ctx = await requireOrgAdmin(organizationId);
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail("Check the amounts — they must be whole cents, and the currency a 3-letter code.");
    const data = parsed.data;
    if (data.billingModel === "per_post" && data.perPostCents == null) return fail("Per-post billing needs a per-post rate.");
    if (data.billingModel === "retainer" && data.retainerCents <= 0) return fail("A retainer needs an amount above zero.");

    const [ws] = await db
      .select({ id: workspace.id })
      .from(workspace)
      .where(and(eq(workspace.id, workspaceId), eq(workspace.organizationId, organizationId)));
    if (!ws) return fail("That client isn't in this organization.");

    const [before] = await db.select().from(clientRate).where(eq(clientRate.workspaceId, workspaceId));
    await db
      .insert(clientRate)
      .values({ organizationId, workspaceId, ...data, createdByUserId: ctx.userId })
      .onConflictDoUpdate({ target: clientRate.workspaceId, set: { ...data, updatedAt: new Date() } });

    await audit({
      action: "agency.client_rate.update",
      actorUserId: ctx.userId,
      organizationId,
      workspaceId,
      targetType: "workspace",
      targetId: workspaceId,
      summary: { before: before ?? null, after: data },
    });
    revalidatePath("/agency");
    return { ok: "Client rate saved." };
  });
}
