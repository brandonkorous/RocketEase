import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { LEGAL_DOCS, LEGAL_SUMMARY } from "@/content/legal";
import { CONTACT, ENTITY, formatLegalDate, formattedAddress } from "@/lib/site";

export const metadata: Metadata = {
  title: "Legal — RocketEase",
  description: "Every RocketEase legal document in one place: privacy, terms, acceptable use, data processing, subprocessors, copyright, cookies, security and more.",
};

export default function LegalIndexPage() {
  return (
    <PageShell>
      <PageHeader
        title="Legal"
        lede="Every document in one place. Written to be read — plain sentences, no defined-term thickets, and an honest account of what we do and do not do."
      />
      <div className="page-container pt-14 pb-24">
        <ul className="grid gap-px overflow-hidden rounded-box border border-base-300 bg-base-300 sm:grid-cols-2">
          {LEGAL_DOCS.map((doc) => (
            <li key={doc.slug} className="bg-base-100">
              <Link href={`/${doc.slug}`} className="block h-full p-6 transition-colors hover:bg-base-200">
                <p className="text-base font-semibold text-base-content">{doc.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-secondary">{LEGAL_SUMMARY[doc.slug]}</p>
                <p className="mt-4 text-xs text-secondary/70">Updated {formatLegalDate(doc.updated)}</p>
              </Link>
            </li>
          ))}
        </ul>

        <section className="mt-14 max-w-2xl">
          <h2 className="text-lg font-semibold text-base-content">Contacting us</h2>
          <p className="mt-3 text-base leading-relaxed text-secondary">
            Privacy requests, legal notices, copyright notices and security reports all reach us at{" "}
            <a href={`mailto:${CONTACT.legal}`} className="font-medium text-base-content underline underline-offset-3">
              {CONTACT.legal}
            </a>
            . Copyright notices must follow the procedure in our{" "}
            <Link href="/copyright" className="font-medium text-base-content underline underline-offset-3">
              copyright policy
            </Link>{" "}
            to be effective.
          </p>
          <address className="mt-5 text-base not-italic leading-relaxed text-secondary">
            {ENTITY.legalName}
            <br />
            {formattedAddress()}
          </address>
        </section>
      </div>
    </PageShell>
  );
}
