import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { PageShell } from "@/components/page-shell";

const SUGGESTIONS = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Integrations", href: "/integrations" },
  { label: "Help center", href: "/help" },
  { label: "Legal", href: "/legal" },
  { label: "Contact", href: "/contact" },
];

export default function NotFound() {
  return (
    <PageShell>
      <div className="page-container section-pad">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-secondary">404</p>
          <h1 className="h2-marketing mt-3">That page does not exist</h1>
          <p className="mt-5 text-lg leading-relaxed text-secondary">
            The link may be out of date, or we may have moved something. Here is where most people were heading.
          </p>
          <ul className="mt-8 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <li key={s.href}>
                <Link href={s.href} className={buttonClasses({ color: "neutral", variant: "outline", size: "sm" })}>
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-10">
            <Link href="/" className={buttonClasses({ color: "primary" })}>
              Back to the home page
            </Link>
          </p>
        </div>
      </div>
    </PageShell>
  );
}
