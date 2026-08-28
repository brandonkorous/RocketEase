import Link from "next/link";
import { ArrowRightIcon, Mark, PlatformIcon, type Platform } from "@make-it-social/ui/icons";
import { primaryCta, textCta } from "./shared";

const ORBIT: { platform: Platform; className: string }[] = [
  { platform: "instagram", className: "left-1/12 top-1/12" },
  { platform: "tiktok", className: "right-1/12 top-1/12" },
  { platform: "linkedin", className: "left-0 top-1/2" },
  { platform: "youtube", className: "right-0 top-1/2" },
  { platform: "facebook", className: "left-1/6 bottom-0" },
  { platform: "x", className: "right-1/6 bottom-0" },
];
const SPOKES = [[38, 45], [262, 33], [14, 168], [286, 156], [62, 268], [236, 274]];

function Orbit() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-75" aria-hidden="true">
      <svg viewBox="0 0 300 300" className="absolute inset-0 h-full w-full text-base-300">
        {SPOKES.map(([x, y]) => (
          <line key={`${x}-${y}`} x1="150" y1="150" x2={x} y2={y} stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 5" />
        ))}
      </svg>
      <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-3xl bg-primary text-primary-content">
        <Mark size={56} />
      </div>
      {ORBIT.map(({ platform, className }) => (
        <span key={platform} className={`absolute flex h-11 w-11 items-center justify-center rounded-full border border-base-300 bg-base-100 ${className}`}>
          <PlatformIcon platform={platform} size={22} />
        </span>
      ))}
    </div>
  );
}

export function FinalCta() {
  return (
    <section className="page-container pb-20 md:pb-28" aria-labelledby="cta-heading">
      <div className="mx-auto grid max-w-300 items-center gap-10 rounded-2xl border border-base-300 bg-base-200 p-8 md:grid-cols-2 md:p-12 lg:p-16">
        <Orbit />
        <div>
          <h2 id="cta-heading" className="h2-marketing">
            Ready to make your marketing social?
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-secondary">
            Start your free trial and bring planning, publishing, engagement, and performance into
            one workflow.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/signup" className={primaryCta}>
              Start free trial
            </Link>
            <Link href="/demo" className={textCta}>
              Book a demo <ArrowRightIcon />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
