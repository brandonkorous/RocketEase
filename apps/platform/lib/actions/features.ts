"use server";

/*
 * Beta participation.
 *
 * An organization can LEAVE a beta it was invited to, and rejoin it. It cannot
 * grant itself one: enrolment is RocketEase's decision, made by staff
 * (`lib/actions/staff.ts`) or bootstrapped through BETA_FEATURES. This module is
 * the customer's half of that — the half that is genuinely theirs.
 */
import { requireOrgAdmin } from "@/lib/actions/agency/shared";
import { fail, guard, type ActionState } from "@/lib/actions/content/shared";
import { audit } from "@/lib/audit";
import { isBetaFeature, isInvited, setParticipation } from "@/lib/features";

const NOT_INVITED = "That beta is invite-only. Ask RocketEase to add this organization.";

export async function setBetaParticipation(input: {
  organizationId: string;
  feature: string;
  participate: boolean;
}): Promise<ActionState> {
  if (!isBetaFeature(input.feature)) return fail("Unknown beta.");
  const feature = input.feature;
  return guard(async () => {
    const org = await requireOrgAdmin(input.organizationId);
    // Rejoining is only possible for an organization that was invited; opting
    // out stays available either way, so a grant can always be shaken off.
    if (input.participate && !(await isInvited(input.organizationId, feature))) return fail(NOT_INVITED);

    await setParticipation({
      organizationId: input.organizationId,
      feature,
      participate: input.participate,
      actorUserId: org.userId,
    });
    await audit({
      action: input.participate ? "feature.join" : "feature.leave",
      actorUserId: org.userId,
      organizationId: input.organizationId,
      targetType: "feature_grant",
      targetId: feature,
      summary: { after: { feature, state: input.participate ? "enabled" : "disabled" } },
    });
    return { ok: input.participate ? "Joined the beta." : "Left the beta." };
  });
}
