import Link from "next/link";
import { Footer, FooterTitle } from "@wizeworks/silicaui-react";
import { Mark, PlatformIcon, type Platform } from "@make-it-social/ui/icons";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Integrations", href: "/integrations" },
      { label: "Pricing", href: "/pricing" },
      { label: "What's new", href: "/changelog" },
      { label: "Roadmap", href: "/roadmap" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Agencies", href: "/solutions/agencies" },
      { label: "Small business", href: "/solutions/small-business" },
      { label: "Ecommerce", href: "/solutions/ecommerce" },
      { label: "Multi-location", href: "/solutions/multi-location" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Guides", href: "/guides" },
      { label: "Templates", href: "/templates" },
      { label: "Help center", href: "/help" },
      { label: "API / Developers", href: "/developers" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "Partners", href: "/partners" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

const SOCIAL: Platform[] = ["instagram", "linkedin", "tiktok", "youtube", "x"];

export function SiteFooter() {
  return (
    <div data-theme="mis-dark" id="resources" className="bg-base-100 text-base-content">
      <div className="page-container pt-16 pb-8">
        <Footer className="grid grid-cols-2 gap-10 bg-transparent p-0 text-base-content md:grid-cols-[1.6fr_repeat(4,1fr)]">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 font-bold" aria-label="Make It Social home">
              <Mark size={26} />
              <span className="text-base">Make It Social</span>
            </Link>
            <p className="mt-4 max-w-65 text-sm leading-relaxed text-secondary">
              The operating system for social marketing. Plan, publish, engage, and optimize in one workflow.
            </p>
            <ul className="mt-5 flex items-center gap-3">
              {SOCIAL.map((p) => (
                <li key={p}>
                  <a
                    href={`https://example.com/${p}`}
                    className="text-secondary transition-colors hover:text-base-content"
                    aria-label={`Make It Social on ${p === "x" ? "X" : p}`}
                  >
                    <PlatformIcon platform={p} size={18} mono />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <FooterTitle className="text-sm font-semibold text-base-content opacity-100">{col.title}</FooterTitle>
              {col.links.map((l) => (
                <Link key={l.label} href={l.href} className="text-sm text-secondary transition-colors hover:text-base-content">
                  {l.label}
                </Link>
              ))}
            </nav>
          ))}
        </Footer>

        <div className="mt-14 flex flex-col gap-3 border-t border-base-300 pt-6 text-sm text-secondary sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Make It Social. All rights reserved.</p>
          <nav aria-label="Legal" className="flex gap-6">
            <Link href="/privacy" className="hover:text-base-content">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-base-content">
              Terms
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
