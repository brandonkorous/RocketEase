/*
 * Single-organization rules for a self-hosted install — pure, so the decision
 * is testable without a database.
 *
 * The first person to sign up claims the install and creates its one
 * organization. After that, an account is created only for an address that
 * holds a pending invitation; everyone else is told whose install it is.
 */
export type SignupDecision = { allowed: true } | { allowed: false; message: string };

export const claimedMessage = (organizationName: string) => `This install belongs to ${organizationName}. Ask one of its owners to invite you.`;

export function signupDecision(input: { selfHosted: boolean; claimedBy: string | null; invited: boolean }): SignupDecision {
  if (!input.selfHosted || input.claimedBy === null || input.invited) return { allowed: true };
  return { allowed: false, message: claimedMessage(input.claimedBy) };
}

/** Whether a signed-in person may create a NEW organization here. */
export function organizationDecision(input: { selfHosted: boolean; claimedBy: string | null }): SignupDecision {
  if (!input.selfHosted || input.claimedBy === null) return { allowed: true };
  return { allowed: false, message: `${claimedMessage(input.claimedBy)} A self-hosted install has one organization.` };
}
