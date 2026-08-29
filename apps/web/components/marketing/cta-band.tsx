import Link from "next/link";
import { ArrowRightIcon } from "@rocketease/ui/icons";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { AUTH_LINKS } from "@/lib/nav";

const primary = buttonClasses({ color: "primary" });
const ghost = buttonClasses({ color: "neutral", variant: "ghost" });

export function CtaBand({
  heading = "Ready to make launching effortless?",
  body = "Start a 14-day free trial. No card required to begin.",
}: {
  heading?: string;
  body?: string;
}) {
  return (
    <section className="border-t border-base-300 bg-base-200" aria-labelledby="cta-band-heading">
      <div className="page-container flex flex-col gap-8 py-16 md:flex-row md:items-center md:justify-between md:py-20">
        <div className="max-w-xl">
          <h2 id="cta-band-heading" className="text-3xl font-bold tracking-tight text-base-content">
            {heading}
          </h2>
          <p className="mt-3 text-lg leading-relaxed text-secondary">{body}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
          <Link href={AUTH_LINKS.signup} className={primary}>
            Start free trial
          </Link>
          <Link href="/demo" className={ghost}>
            Book a demo <ArrowRightIcon />
          </Link>
        </div>
      </div>
    </section>
  );
}
