import { CheckIcon } from "@rocketease/ui/icons";
import { SidePanel } from "@/components/split-shell";
import { GUIDANCE, type GuidanceKey } from "./guidance";
import { ONBOARDING_STEPS, stepIndex, type OnboardingStep } from "./steps";

/** Vertical tracker — Silica's Steps is horizontal only, and the panel is narrow. */
function Tracker({ current }: { current: number }) {
  return (
    <ol className="flex flex-col gap-3" aria-label="Onboarding progress">
      {ONBOARDING_STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.key} className="flex items-center gap-3 text-sm" aria-current={active ? "step" : undefined}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${done || active ? "border-base-content bg-base-content text-base-100" : "border-base-300 text-secondary"}`}>
              {done ? <CheckIcon size={14} /> : i + 1}
            </span>
            <span className={active ? "font-semibold" : done ? "" : "text-secondary"}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** What the fields on screen actually mean (onboarding.md: teach a surface when it is encountered). */
function Explainer({ topic }: { topic: GuidanceKey }) {
  const g = GUIDANCE[topic];
  return (
    <div className="max-w-110">
      <h2 className="text-lg font-semibold tracking-tight">{g.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-secondary">{g.copy}</p>
      <dl className="mt-6 flex flex-col gap-3 text-sm leading-relaxed">
        {g.terms.map(({ term, def }) => (
          <div key={term}>
            <dt className="float-left mr-1.5 font-semibold after:content-['_—']">{term}</dt>
            <dd className="text-secondary">{def}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Left half of onboarding: where you are, and what this step is asking for. */
export function StepPanel({ step }: { step: OnboardingStep }) {
  return (
    <SidePanel label="Onboarding progress" dim>
      <div className="mt-10 shrink-0"><Tracker current={stepIndex(step)} /></div>
      <div className="mt-10 border-t border-base-300 pt-8 pb-10"><Explainer topic={step} /></div>
    </SidePanel>
  );
}

/** Left half of a standalone setup page — guidance only, no step tracker. */
export function GuidancePanel({ topic, label }: { topic: GuidanceKey; label: string }) {
  return (
    <SidePanel label={label} dim>
      <div className="my-auto py-10"><Explainer topic={topic} /></div>
    </SidePanel>
  );
}
