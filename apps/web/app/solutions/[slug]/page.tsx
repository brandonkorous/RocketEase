import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/marketing/section";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { CtaBand } from "@/components/marketing/cta-band";
import { SOLUTIONS, SOLUTION_SLUGS } from "@/content/marketing/solutions";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return SOLUTION_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const solution = SOLUTIONS[(await params).slug];
  if (!solution) return {};
  return { title: `${solution.title} — RocketEase`, description: solution.lede };
}

export default async function SolutionPage({ params }: Params) {
  const solution = SOLUTIONS[(await params).slug];
  if (!solution) notFound();

  return (
    <PageShell>
      <PageHeader
        eyebrow={solution.title}
        title={solution.heading}
        lede={solution.lede}
        crumbs={[{ label: "Solutions", href: "/features" }]}
      />

      <Section id="problems" heading="What gets in the way" tone="muted">
        <dl className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
          {solution.problems.map((p) => (
            <div key={p.title}>
              <dt className="text-base font-semibold text-base-content">{p.title}</dt>
              <dd className="mt-2 text-base leading-relaxed text-secondary">{p.body}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="how" heading="How RocketEase handles it">
        <FeatureGrid features={solution.features} />
        <p className="mt-10 max-w-2xl text-lg leading-relaxed text-base-content">{solution.closing}</p>
      </Section>

      <CtaBand />
    </PageShell>
  );
}
