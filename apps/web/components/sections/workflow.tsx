import Link from "next/link";
import { ArrowRightIcon, CalendarIcon, ChartIcon, InboxIcon, SendIcon } from "@make-it-social/ui/icons";

const STAGES = [
  { icon: CalendarIcon, title: "Plan", copy: "Content ideas, campaigns, a shared calendar, and approvals before anything goes out.", href: "#plan" },
  { icon: SendIcon, title: "Publish", copy: "Cross-network posting, scheduling, per-channel variants, and safe, idempotent delivery.", href: "#publish" },
  { icon: InboxIcon, title: "Engage", copy: "Comments, mentions, and messages in one inbox with assignments and customer context.", href: "#engage" },
  { icon: ChartIcon, title: "Optimize", copy: "Analytics, ads, and attribution that turn what worked into the next plan.", href: "#optimize" },
];

export function Workflow() {
  return (
    <section id="workflow" className="page-container section-pad" aria-labelledby="workflow-heading">
      <div className="mx-auto max-w-170 text-center">
        <h2 id="workflow-heading" className="h2-marketing">
          One platform. Every step.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-secondary">
          Make It Social brings your entire social marketing workflow together so nothing falls
          through the cracks.
        </p>
      </div>

      <ol className="mt-14 grid gap-y-10 md:grid-cols-2 md:gap-y-12 lg:grid-cols-4 lg:gap-y-0 lg:divide-x lg:divide-base-300">
        {STAGES.map(({ icon: Icon, title, copy, href }, i) => (
          <li key={title} className="flex flex-col lg:px-8 lg:first:pl-0 lg:last:pr-0">
            <div className="flex items-center gap-3">
              <Icon size={24} />
              <span className="text-sm font-semibold text-secondary/70">0{i + 1}</span>
            </div>
            <h3 className="mt-4 text-2xl font-bold tracking-tight">{title}</h3>
            <p className="mt-2 flex-1 text-base leading-relaxed text-secondary">{copy}</p>
            <Link href={href} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
              Learn more <ArrowRightIcon size={14} />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
