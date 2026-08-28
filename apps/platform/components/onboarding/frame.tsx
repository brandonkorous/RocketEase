import Link from "next/link";
import { Mark } from "@make-it-social/ui/icons";
import { Step, Steps } from "@wizeworks/silicaui-react";

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

/** Onboarding chrome (onboarding mockup): brand, 5-step tracker, exit link, centered card. */
export function OnboardingFrame({ step, exitHref, children }: { step: OnboardingStep; exitHref: string | null; children: React.ReactNode }) {
  const current = stepIndex(step);
  return (
    <div className="flex min-h-dvh flex-col bg-base-200/40">
      <header className="grid h-16 grid-cols-[1fr_auto_1fr] items-center px-6">
        <Link href="/" className="flex items-center gap-2.5 font-bold" aria-label="Make It Social"><Mark size={28} /><span>Make It Social</span></Link>
        <Steps className="hidden text-xs md:flex" aria-label="Onboarding progress">
          {ONBOARDING_STEPS.map((s, i) => (
            <Step key={s.key} color={i <= current ? "primary" : undefined} data-content={i < current ? "✓" : String(i + 1)}>{s.label}</Step>
          ))}
        </Steps>
        <div className="justify-self-end">{exitHref && <Link href={exitHref} className="text-sm text-secondary hover:underline">Exit onboarding</Link>}</div>
      </header>
      <p className="text-center text-xs text-secondary md:hidden">Step {Math.min(current + 1, ONBOARDING_STEPS.length)} of {ONBOARDING_STEPS.length}</p>
      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-8">
        <div className="w-full max-w-120 rounded-box border border-base-300 bg-base-100 p-6 md:p-8">{children}</div>
      </main>
    </div>
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
