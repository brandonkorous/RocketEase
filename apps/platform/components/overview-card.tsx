import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";

/** The panel every overview screen is built from: title, one link, content. */
export function OverviewCard({ title, href, linkLabel, children }: { title: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <section className="rounded-box border border-base-300 p-5" aria-label={title}>
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold">{title}</h2><Link href={href} className="text-xs font-medium hover:underline">{linkLabel}</Link></div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Designed empty state inside a card: what it is, why it is empty, one action. */
export function OverviewEmpty({ title, body, cta, href, learn }: { title: string; body: string; cta: string; href: string; learn?: string }) {
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <div className="h-14 w-20 rounded-lg border border-dashed border-base-300" aria-hidden="true" />
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-65 text-xs leading-normal text-secondary">{body}</p>
      <Link href={href} className={`${buttonClasses({ color: "primary", size: "sm" })} mt-3`}>{cta}</Link>
      {learn && <span className="mt-2 text-xs text-secondary/70">{learn} →</span>}
    </div>
  );
}
