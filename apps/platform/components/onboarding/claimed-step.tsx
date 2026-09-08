import { UsersIcon } from "../shell/icons";
import { StepIntro } from "./frame";

/** Onboarding on a claimed self-hosted install for a person with no workspace: whose install it is, and what to do. */
export function ClaimedStep({ organizationName }: { organizationName: string }) {
  return (
    <div className="flex flex-col gap-4">
      <StepIntro icon={<UsersIcon />} title={`This install belongs to ${organizationName}`} copy="A self-hosted RocketEase has one organization. Ask one of its owners to invite you to a workspace; the invitation email brings you straight in." />
      <p className="text-center text-sm text-secondary">Signed in with the wrong account? Sign out from the menu and use the invited address.</p>
    </div>
  );
}
