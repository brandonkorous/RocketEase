import { ChartIcon, CalendarIcon, InboxIcon } from "@rocketease/ui/icons";
import { SidePanel } from "@/components/split-shell";

const FEATURES = [
  { icon: InboxIcon, title: "Unified social inbox", copy: "All messages, comments, and mentions in one place." },
  { icon: CalendarIcon, title: "Powerful planning", copy: "Visual calendar, content planner & smart scheduling." },
  { icon: ChartIcon, title: "Actionable analytics", copy: "Track performance and grow with data you trust." },
];

/**
 * Left half of the auth split screen (images/auth mockup): the brand promise
 * over a monochrome photo. No invented proof or logos.
 */
export function BrandPanel() {
  return (
    <SidePanel label="RocketEase">
      <div className="my-auto max-w-95 py-10">
        <h2 className="text-4xl font-bold leading-tight tracking-tight">Effortless Launch.<br /><span className="font-normal">Better by Design.</span></h2>
        <p className="mt-5 text-base leading-relaxed text-secondary">Plan, publish, engage, and grow across every platform from one powerful, easy-to-use social marketing platform.</p>
        <ul className="mt-8 flex flex-col gap-5">
          {FEATURES.map(({ icon: Icon, title, copy }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-field border border-base-300"><Icon size={18} /></span>
              <span><span className="block text-sm font-semibold">{title}</span><span className="block text-sm text-secondary">{copy}</span></span>
            </li>
          ))}
        </ul>
      </div>
    </SidePanel>
  );
}
