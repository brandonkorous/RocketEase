"use server";

/*
 * Media generation actions.
 *
 * Every entry point checks the beta grant SERVER-SIDE. Hiding a button is not
 * access control — the same rule middleware.ts already carries.
 */
import { z } from "zod";
import { JOB_KINDS, isUnknownCost, type GenerationSpec } from "@rocketease/media";
import { fail, guard, type ActionState } from "@/lib/actions/content/shared";
import { hasFeature } from "@/lib/features";
import { createMediaJob, previewJob } from "@/lib/media/jobs";
import { requireCapability, requireWorkspace } from "@/lib/session";

const NO_ACCESS = "Media generation isn't available for this organization.";

const specSchema = z.object({
  workspaceId: z.string().min(1),
  jobKind: z.enum(JOB_KINDS),
  prompt: z.string().trim().min(3, "Describe what to generate.").max(2000),
  durationSeconds: z.coerce.number().int().min(1).max(300).optional(),
  count: z.coerce.number().int().min(1).max(4).optional(),
  aspect: z.string().trim().max(16).optional(),
  modelKey: z.string().trim().max(80).optional(),
});
export type GenerateInput = z.input<typeof specSchema>;

const toSpec = (d: z.infer<typeof specSchema>): GenerationSpec => ({
  jobKind: d.jobKind,
  prompt: d.prompt,
  durationSeconds: d.durationSeconds,
  count: d.count,
  aspect: d.aspect,
  modelKey: d.modelKey,
});

export type PreviewResult = { model: string; reason: string; cost: string } | { error: string };

/** What the generate button shows BEFORE anything is spent. */
export async function previewGeneration(input: GenerateInput): Promise<PreviewResult> {
  const parsed = specSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  const ctx = await requireWorkspace(parsed.data.workspaceId);
  if (!(await hasFeature(ctx.workspace.organizationId, "media.generation"))) return { error: NO_ACCESS };

  const preview = previewJob(toSpec(parsed.data));
  if ("error" in preview) return { error: preview.error ?? "No model can run this request." };
  return {
    model: preview.model.label,
    reason: preview.reason,
    // An unpriceable job says so plainly rather than showing a confident wrong number.
    cost: isUnknownCost(preview.estimate)
      ? preview.estimate.unknown
      : preview.estimate.amountUsd === null
        ? "Cost unknown — no rate configured for this model."
        : `About $${preview.estimate.amountUsd.toFixed(2)} for ${preview.estimate.quantity} ${preview.estimate.unit.replace(/_/g, " ")}.`,
  };
}

export async function generateMedia(input: GenerateInput): Promise<ActionState & { mediaJobId?: string }> {
  const parsed = specSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request");
  return guard(async () => {
    const ctx = await requireCapability(parsed.data.workspaceId, "content.create");
    const organizationId = ctx.workspace.organizationId;
    if (!(await hasFeature(organizationId, "media.generation"))) return fail(NO_ACCESS);

    const created = await createMediaJob({
      organizationId,
      workspaceId: parsed.data.workspaceId,
      userId: ctx.session.user.id,
      spec: toSpec(parsed.data),
    });
    if ("error" in created) return fail(created.error);
    return { ok: `Generating with ${created.modelKey}. It'll appear in the library when it's done.`, mediaJobId: created.mediaJobId };
  });
}
