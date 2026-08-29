import Link from "next/link";

type Crumb = { label: string; href: string };

export function PageHeader({
  eyebrow,
  title,
  lede,
  crumbs,
  children,
}: {
  /** Small contextual label — a section name, never a marketing eyebrow. */
  eyebrow?: string;
  title: string;
  lede?: string;
  crumbs?: Crumb[];
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-base-300 bg-base-200">
      <div className="page-container pt-14 pb-14 md:pt-20 md:pb-16">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-5">
            <ol className="flex flex-wrap items-center gap-2 text-sm text-secondary">
              {crumbs.map((c) => (
                <li key={c.href} className="flex items-center gap-2">
                  <Link href={c.href} className="hover:text-base-content">
                    {c.label}
                  </Link>
                  <span aria-hidden="true">/</span>
                </li>
              ))}
              <li aria-current="page" className="text-base-content">
                {title}
              </li>
            </ol>
          </nav>
        )}
        {eyebrow && <p className="mb-3 text-sm font-semibold text-secondary">{eyebrow}</p>}
        <h1 className="h2-marketing max-w-4xl">{title}</h1>
        {lede && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-secondary">{lede}</p>}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </header>
  );
}
