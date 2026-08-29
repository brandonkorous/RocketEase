import Link from "next/link";
import { Footer, FooterTitle } from "@wizeworks/silicaui-react";
import { Mark } from "@rocketease/ui/icons";
import { Wordmark } from "@rocketease/ui/brand";
import { FOOTER_BOTTOM, FOOTER_COLUMNS } from "@/lib/nav";
import { ENTITY } from "@/lib/site";

export function SiteFooter() {
  return (
    <div data-theme="rke-dark" id="resources" className="bg-base-100 text-base-content">
      <div className="page-container pt-16 pb-8">
        <Footer className="grid grid-cols-2 gap-10 bg-transparent p-0 text-base-content md:grid-cols-3 lg:grid-cols-[1.4fr_repeat(5,1fr)]">
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 font-bold" aria-label="RocketEase home">
              <Mark size={26} />
              <Wordmark className="text-base" />
            </Link>
            <p className="mt-4 max-w-65 text-sm leading-relaxed text-secondary">
              The operating system for social marketing. Plan, publish, engage, and optimize in one workflow.
            </p>
            <address className="mt-5 text-sm not-italic leading-relaxed text-secondary">
              {ENTITY.legalName}
              <br />
              {ENTITY.address.line1}
              <br />
              {ENTITY.address.city}, {ENTITY.address.region} {ENTITY.address.postalCode}
            </address>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <FooterTitle className="text-sm font-semibold text-base-content opacity-100">{col.title}</FooterTitle>
              {col.links.map((l) => (
                <Link key={l.href} href={l.href} className="text-sm text-secondary transition-colors hover:text-base-content">
                  {l.label}
                </Link>
              ))}
            </nav>
          ))}
        </Footer>

        <div className="mt-14 flex flex-col gap-3 border-t border-base-300 pt-6 text-sm text-secondary sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {ENTITY.legalName}. All rights reserved.
          </p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2">
            {FOOTER_BOTTOM.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-base-content">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
