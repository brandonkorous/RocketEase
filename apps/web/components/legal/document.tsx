import Link from "next/link";
import type { LegalDoc } from "@/content/legal/types";
import { formatLegalDate } from "@/lib/site";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { BlockList } from "./blocks";

export function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <PageShell>
      <PageHeader eyebrow="Legal" title={doc.heading} lede={doc.lede} crumbs={[{ label: "Legal", href: "/legal" }]}>
        <p className="text-sm text-secondary">Last updated {formatLegalDate(doc.updated)}</p>
      </PageHeader>

      <div className="page-container grid gap-12 pt-12 pb-24 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
        <Contents sections={doc.sections} />
        <article className="min-w-0 max-w-3xl">
          {doc.sections.map((section, i) => (
            <section key={section.id} id={section.id} className="scroll-mt-24 first:mt-0 mt-12">
              <h2 className="text-xl font-semibold tracking-tight text-base-content">
                <span className="mr-2 text-secondary tabular-nums">{i + 1}.</span>
                {section.heading}
              </h2>
              <BlockList blocks={section.blocks} />
            </section>
          ))}
          <p className="mt-14 border-t border-base-300 pt-6 text-sm text-secondary">
            Questions about this document? See <Link href="/legal" className="underline underline-offset-3">all legal documents</Link> or{" "}
            <Link href="/contact" className="underline underline-offset-3">contact us</Link>.
          </p>
        </article>
      </div>
    </PageShell>
  );
}

function Contents({ sections }: { sections: LegalDoc["sections"] }) {
  return (
    <nav aria-label="On this page" className="hidden lg:block">
      <p className="text-sm font-semibold text-base-content">On this page</p>
      <ol className="mt-4 space-y-2.5 border-l border-base-300">
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className="-ml-px block border-l border-transparent pl-4 text-sm text-secondary hover:border-base-content hover:text-base-content">
              {s.heading}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
