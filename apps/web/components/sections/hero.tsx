import Link from "next/link";
import { Text } from "@wizeworks/silicaui-react";
import { ArrowRightIcon, CheckIcon } from "@rocketease/ui/icons";
import { HeroCalendar } from "../product-surfaces";
import { AUTH_LINKS } from "@/lib/nav";
import { primaryCta, textCta } from "./shared";

export function Hero() {
  return (
    <section className="page-container pt-12 pb-16 md:pt-20 md:pb-24 lg:pt-24 lg:pb-28">
      <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-5">
          <h1 className="hero-title">
            Effortless
            <br />
            Launch.
            <br />
            <span className="light">Better by Design.</span>
          </h1>
          <Text variant="lead" className="mt-6 max-w-130 text-lg leading-relaxed text-secondary">
            Plan, publish, engage, and grow across every platform from one powerful, easy-to-use
            social marketing platform.
          </Text>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href={AUTH_LINKS.signup} className={primaryCta}>
              Start your free trial
            </Link>
            <Link href="/demo" className={textCta}>
              Book a demo <ArrowRightIcon />
            </Link>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-secondary">
            {["No credit card", "14-day free trial", "Cancel anytime"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckIcon size={15} className="text-base-content" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="lg:col-span-7">
          <HeroCalendar />
        </div>
      </div>
    </section>
  );
}
