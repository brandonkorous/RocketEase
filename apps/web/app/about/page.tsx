import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { Section, Prose } from "@/components/marketing/section";
import { CtaBand } from "@/components/marketing/cta-band";
import { ENTITY, formattedAddress } from "@/lib/site";

export const metadata: Metadata = {
  title: "About — RocketEase",
  description: "Who builds RocketEase, what we believe about social marketing software, and the constraints we hold ourselves to.",
};

const PRINCIPLES = [
  { title: "Never invent proof", body: "You will not find a customer logo, a testimonial, a benchmark or a statistic on this site that we cannot substantiate. When we have none, we say so. It is written into our own documentation as a rule, not a preference." },
  { title: "Honest capability", body: "We model what each connected channel can actually do, with a reason and a last-checked time, rather than claiming a network supports something because a competitor's marketing page says it does." },
  { title: "A missing number is not zero", body: "When a network stops reporting a metric, we show unavailable and why. Rendering it as zero would be easier to build and would quietly lie to you." },
  { title: "Black, white, and structure", body: "The interface is monochrome. The only colour comes from the social networks themselves. No gradients, no decorative illustration, nothing that competes with your content for attention." },
  { title: "Tenancy is not a feature", body: "Authorization is enforced on the server for every request, and a user who is not a member of a workspace cannot learn it exists. It is tested at the database level on every change." },
  { title: "Say what we have not done", body: "Our security page lists the audits we do not hold. Our accessibility statement lists the gaps we know about. Both would read better if we left those out." },
];

export default function AboutPage() {
  return (
    <PageShell>
      <PageHeader
        title="Effortless launch. Better by design."
        lede="RocketEase is a social marketing operating system — plan, publish, engage, promote, measure — built for businesses and the agencies that serve them."
      />

      <Section id="why" heading="Why we built it">
        <Prose>
          <p>
            Social marketing tools tend to be one of two things. Either a scheduler that treats publishing as the whole job and stops
            at the point where a customer replies, or a suite so large that using any part of it means learning all of it.
          </p>
          <p>
            The actual work is a loop: decide what to say, say it in the right shape for each network, answer the people who respond,
            and find out whether any of it moved the business. Every handoff between those stages is where a tool usually makes you
            re-key something, open a second app, or paste a screenshot into a deck.
          </p>
          <p>
            RocketEase is one system of record across that whole loop. A post, its variants, the conversation it started, the campaign
            it belonged to and the revenue it produced are the same record — not four exports that someone reconciles on a Friday.
          </p>
        </Prose>
      </Section>

      <Section id="principles" heading="What we hold ourselves to" tone="muted">
        <dl className="grid gap-x-12 gap-y-9 md:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <div key={p.title}>
              <dt className="text-base font-semibold text-base-content">{p.title}</dt>
              <dd className="mt-2 text-base leading-relaxed text-secondary">{p.body}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="company" heading="The company">
        <Prose>
          <p>
            RocketEase is built and operated by {ENTITY.legalName}, a {ENTITY.formationState} limited liability company based at{" "}
            {formattedAddress()}.
          </p>
          <p>
            We are early, small, and not going to pretend otherwise. We have no third-party security attestation yet, and our{" "}
            <Link href="/security" className="font-medium text-base-content underline underline-offset-3">
              security page
            </Link>{" "}
            says so before it says anything else. If that is disqualifying for your procurement process, we would rather you knew now.
          </p>
          <p>
            What we do have is a product built on decisions you can inspect — tenant isolation tested on every change, publishing that
            reconciles before it retries, attribution that refuses to double-count, and a{" "}
            <Link href="/legal" className="font-medium text-base-content underline underline-offset-3">
              set of legal documents
            </Link>{" "}
            written to be read rather than to be survived.
          </p>
        </Prose>
      </Section>

      <CtaBand heading="See whether it fits how you work" body="Start a free trial, or ask us the awkward question first." />
    </PageShell>
  );
}
