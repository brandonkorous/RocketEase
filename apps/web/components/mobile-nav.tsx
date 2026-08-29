"use client";

import Link from "next/link";
import { Button } from "@wizeworks/silicaui-react";
import { AUTH_LINKS, COMPANY_LINKS, PRODUCT_LINKS, RESOURCE_LINKS, SOLUTION_LINKS, type NavColumn } from "@/lib/nav";

const SECTIONS: NavColumn[] = [
  { title: "Product", links: [...PRODUCT_LINKS, { label: "Pricing", href: "/pricing" }] },
  { title: "Solutions", links: SOLUTION_LINKS },
  { title: "Resources", links: RESOURCE_LINKS },
  { title: "Company", links: COMPANY_LINKS },
];

export function MobileNav({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav id="mobile-nav" aria-label="Mobile" className="max-h-dvh overflow-y-auto border-t border-base-300 bg-base-100 lg:hidden">
      <div className="page-container flex flex-col gap-6 py-5">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="px-3 text-xs font-semibold tracking-wide text-secondary uppercase">{section.title}</p>
            <ul className="mt-1">
              {section.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} onClick={onNavigate} className="block rounded-field px-3 py-2.5 text-base font-medium hover:bg-base-200">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="flex flex-col gap-2 sm:hidden">
          <Button color="primary" size="lg" render={<Link href={AUTH_LINKS.signup} />}>
            Start free trial
          </Button>
          <Button variant="outline" color="neutral" size="lg" render={<Link href={AUTH_LINKS.login} />}>
            Log in
          </Button>
        </div>
      </div>
    </nav>
  );
}
