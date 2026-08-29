import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { CONTACT } from "@/lib/site";

/**
 * Honest empty state for a real route with no content yet. The docs forbid
 * inventing proof, so a page with nothing to show says exactly that.
 */
export function NotYet({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="page-container section-pad">
      <div className="mx-auto max-w-2xl rounded-box border border-base-300 bg-base-200 p-8 text-center md:p-12">
        <h2 className="text-2xl font-bold tracking-tight text-base-content">{title}</h2>
        <p className="mt-4 text-base leading-relaxed text-secondary">{body}</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={action?.href ?? "/contact"} className={buttonClasses({ color: "primary" })}>
            {action?.label ?? "Get in touch"}
          </Link>
          <a href={`mailto:${CONTACT.general}`} className={buttonClasses({ color: "neutral", variant: "outline" })}>
            Email us
          </a>
        </div>
      </div>
    </div>
  );
}
