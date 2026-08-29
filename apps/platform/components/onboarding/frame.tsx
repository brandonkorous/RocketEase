import Link from "next/link";
import { Step, Steps } from "@wizeworks/silicaui-react";
import { SplitShell } from "@/components/split-shell";
import { StepPanel } from "./step-panel";
import { ONBOARDING_STEPS, stepIndex, type OnboardingStep } from "./steps";

export { ONBOARDING_STEPS, stepIndex };
export type { OnboardingStep };

/**
 * Onboarding chrome: the split screen used by auth, with the left panel
 * carrying the step tracker and help for the fields on screen. Below lg the
 * panel is hidden, so the tracker falls back to the horizontal Steps header.
 */
export function OnboardingFrame({ step, exitHref, children }: { step: OnboardingStep; exitHref: string | null; children: React.ReactNode }) {
  const current = stepIndex(step);
  const header = (
    <>
      <Steps className="hidden text-xs sm:flex lg:hidden" aria-label="Onboarding progress">
        {ONBOARDING_STEPS.map((s, i) => (
          <Step key={s.key} color={i <= current ? "primary" : undefined} data-content={i < current ? "✓" : String(i + 1)}>{s.label}</Step>
        ))}
      </Steps>
      {exitHref ? <Link href={exitHref} className="shrink-0 text-sm text-secondary hover:underline">Exit onboarding</Link> : <span />}
    </>
  );
  return (
    <SplitShell panel={<StepPanel step={step} />} header={header} align="start" width="max-w-120">
      <p className="mb-4 text-center text-xs text-secondary sm:hidden">Step {Math.min(current + 1, ONBOARDING_STEPS.length)} of {ONBOARDING_STEPS.length}</p>
      <div className="rounded-box border border-base-300 bg-base-100 p-6 md:p-8">{children}</div>
    </SplitShell>
  );
}

export function StepIntro({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return (
    <div className="mb-6 flex flex-col items-center text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-box border border-base-300">{icon}</span>
      <h1 className="mt-4 text-xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1.5 max-w-80 text-sm text-secondary">{copy}</p>
    </div>
  );
}
