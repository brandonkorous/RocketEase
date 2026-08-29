import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { Section, Prose } from "@/components/marketing/section";
import { AUTH_LINKS } from "@/lib/nav";
import { CONTACT } from "@/lib/site";
import { TRIAL_DAYS } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Book a demo — RocketEase",
  description: "Book a walkthrough of RocketEase, or start a free trial and look at it yourself first.",
};

const SUBJECTS = [
  { label: "Agency setup — many clients, one overview", body: "Client workspaces, roles, approvals, per-client economics and white-labelled reports." },
  { label: "Migrating from another tool", body: "What moves, what does not, and what the first week actually looks like." },
  { label: "Attribution and reporting", body: "How the paid and organic split works, and why our conversion numbers will not match a network's dashboard." },
  { label: "Security and procurement", body: "Tenancy, encryption, our DPA, subprocessors, and the attestations we do not hold yet." },
];

export default function DemoPage() {
  return (
    <PageShell>
      <PageHeader
        title="Book a demo"
        lede="A real walkthrough with someone who built it, on whatever you actually need to see. Thirty minutes, no deck."
      />

      <Section id="how">
        <div className="max-w-2xl rounded-box border border-base-300 bg-base-200 p-8">
          <h2 className="text-xl font-semibold text-base-content">Email us and we will find a time</h2>
          <p className="mt-3 text-base leading-relaxed text-secondary">
            We do not have a scheduling widget on this page yet, and we are not going to put a form here that pretends to be one. Tell
            us what you want to see and roughly when suits, and we will reply within one business day.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a href={`mailto:${CONTACT.general}?subject=Demo%20request`} className={buttonClasses({ color: "primary" })}>
              Email {CONTACT.general}
            </a>
            <Link href={AUTH_LINKS.signup} className={buttonClasses({ color: "neutral", variant: "outline" })}>
              Or start a {TRIAL_DAYS}-day trial
            </Link>
          </div>
        </div>
      </Section>

      <Section id="subjects" heading="What we can walk you through" tone="muted">
        <dl className="grid max-w-4xl gap-x-12 gap-y-7 md:grid-cols-2">
          {SUBJECTS.map((s) => (
            <div key={s.label}>
              <dt className="text-base font-semibold text-base-content">{s.label}</dt>
              <dd className="mt-2 text-base leading-relaxed text-secondary">{s.body}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="honest" heading="Before you book">
        <Prose>
          <p>
            The trial is {TRIAL_DAYS} days and needs no card, so if you would rather poke at it yourself first, do that — a demo is
            more useful once you have found the thing that bothers you.
          </p>
          <p>
            One thing worth knowing up front: connecting a live Instagram, Facebook, LinkedIn or TikTok account depends on each
            network approving our developer app, and those reviews are in progress. Current status is on the{" "}
            <Link href="/integrations" className="font-medium text-base-content underline underline-offset-3">
              integrations page
            </Link>
            . We would rather you read that before a call than discover it during one.
          </p>
        </Prose>
      </Section>
    </PageShell>
  );
}
