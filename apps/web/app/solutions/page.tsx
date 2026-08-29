import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/marketing/section";
import { CtaBand } from "@/components/marketing/cta-band";
import { SOLUTIONS, SOLUTION_SLUGS } from "@/content/marketing/solutions";

export const metadata: Metadata = {
  title: "Solutions — RocketEase",
  description: "How RocketEase fits agencies, small businesses, ecommerce stores and multi-location brands.",
};

export default function SolutionsIndexPage() {
  return (
    <PageShell>
      <PageHeader
        title="Solutions"
        lede="The same product, described for the shape of work you actually do. Nothing here is a different edition — there is one plan and every feature is in it."
      />
      <Section id="list">
        <ul className="grid gap-px overflow-hidden rounded-box border border-base-300 bg-base-300 sm:grid-cols-2">
          {SOLUTION_SLUGS.map((slug) => {
            const s = SOLUTIONS[slug];
            return (
              <li key={slug} className="bg-base-100">
                <Link href={`/solutions/${slug}`} className="block h-full p-7 transition-colors hover:bg-base-200">
                  <p className="text-sm font-semibold text-secondary">{s.title}</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-base-content">{s.heading}</h2>
                  <p className="mt-3 text-base leading-relaxed text-secondary">{s.lede}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>
      <CtaBand />
    </PageShell>
  );
}
