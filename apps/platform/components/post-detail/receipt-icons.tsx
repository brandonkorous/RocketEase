import type { StepIcon, StepTone } from "@/lib/publishing/receipt";

const PATHS: Record<StepIcon, string> = {
  check: "M3.5 8.5 6.5 11.5 12.5 4.5",
  clock: "M8 4.5V8l2.5 1.5M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z",
  send: "M13.5 2.5 2.5 6.5l4.2 1.8 1.8 4.2 5-10Z",
  sync: "M13.5 8a5.5 5.5 0 1 1-1.7-4M13.5 2.5V6H10",
  alert: "M8 5v4M8 11.5h.01M8 2 1.5 13.5h13L8 2Z",
  dash: "M4 8h8",
};

const TONE: Record<StepTone, string> = { done: "text-base-content", pending: "text-secondary/70", problem: "text-error" };

/** Status is always icon + label; the icon never carries the meaning alone. */
export function StepGlyph({ icon, tone, size = 16 }: { icon: StepIcon; tone: StepTone; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className={`shrink-0 ${TONE[tone]}`}>
      <path d={PATHS[icon]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
