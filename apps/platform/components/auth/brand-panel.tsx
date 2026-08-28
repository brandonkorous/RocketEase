import Link from "next/link";
import { ChartIcon, CalendarIcon, InboxIcon, Mark } from "@make-it-social/ui/icons";

const FEATURES = [
  { icon: InboxIcon, title: "Unified social inbox", copy: "All messages, comments, and mentions in one place." },
  { icon: CalendarIcon, title: "Powerful planning", copy: "Visual calendar, content planner & smart scheduling." },
  { icon: ChartIcon, title: "Actionable analytics", copy: "Track performance and grow with data you trust." },
];

/**
 * Left half of the auth split screen (images/auth mockup): black panel with
 * the brand promise over a monochrome photo. No invented proof or logos.
 */
export function BrandPanel() {
  return (
    <aside data-theme="mis-dark" className="relative hidden overflow-hidden bg-base-100 text-base-content lg:flex lg:w-1/2 lg:flex-col" aria-label="Make It Social">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/auth-hero.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-right opacity-60 grayscale" />
      <div className="relative flex h-full flex-col justify-between p-10">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-bold" aria-label="Make It Social home"><Mark size={30} /><span>Make It Social</span></Link>
        <div className="max-w-95">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">Everything social.<br /><span className="font-normal">One workflow.</span></h2>
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
        <span />
      </div>
    </aside>
  );
}
