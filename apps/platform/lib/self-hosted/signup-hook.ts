/*
 * Better Auth database hook: refuse creating an account on a claimed
 * self-hosted install unless the address was invited. A database hook, not a
 * route hook, so social sign-in and One Tap are held to the same rule as the
 * password form. Denials are audited against the install's organization.
 */
import { APIError } from "better-auth/api";
import { audit } from "@/lib/audit";
import { isSelfHosted } from "@/lib/deployment";
import { hasPendingInvitation, installOrganization } from "./install";
import { signupDecision } from "./policy";

export async function refuseSignupWhenClaimed(user: { email: string }): Promise<void> {
  if (!isSelfHosted()) return;
  const org = await installOrganization();
  const decision = signupDecision({ selfHosted: true, claimedBy: org?.name ?? null, invited: org ? await hasPendingInvitation(user.email) : false });
  if (decision.allowed) return;
  await audit({ action: "auth.signup_refused", actorUserId: null, organizationId: org!.id, result: "denied", summary: { note: "self-hosted install already claimed; no invitation" } });
  throw new APIError("FORBIDDEN", { message: decision.message, code: "INSTALL_CLAIMED" });
}
