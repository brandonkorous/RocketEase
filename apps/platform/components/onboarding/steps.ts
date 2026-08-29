export const ONBOARDING_STEPS = [
  { key: "workspace", label: "Workspace" },
  { key: "connect", label: "Connect" },
  { key: "invite", label: "Invite" },
  { key: "goals", label: "Goals" },
  { key: "first-post", label: "First post" },
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]["key"] | "done";

export function stepIndex(step: OnboardingStep) {
  return step === "done" ? ONBOARDING_STEPS.length : ONBOARDING_STEPS.findIndex((s) => s.key === step);
}
