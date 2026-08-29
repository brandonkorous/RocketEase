import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/marketing/section";
import { CtaBand } from "@/components/marketing/cta-band";
import { PriceCards } from "@/components/marketing/price-cards";
import { AUTH_LINKS } from "@/lib/nav";
import { INCLUDED, METERED, TRIAL_DAYS } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Pricing — RocketEase",
  description:
    "One plan per workspace with every feature included, a 14-day free trial, AI credits you can watch as you spend them, and cancellation in one click.",
};

const FAQ = [
  { q: "Is there a limited tier?", a: "No. There is one plan, and it includes everything — the inbox, analytics, approvals, campaigns, SSO and the audit log. We would rather charge fairly for the product than sell you a version of it that is deliberately broken." },
  { q: "What is a workspace?", a: "One brand or one client. An agency running twelve clients has twelve workspaces inside one organization, and one bill." },
  { q: "What happens when the trial ends?", a: `If you have not added a payment method, the account pauses — we do not charge you. If you have, the subscription starts at the plan you picked, and we email you before it does. The trial is ${TRIAL_DAYS} days and needs no card to begin.` },
  { q: "What is an AI credit?", a: "The unit we meter generation in: one credit is a thousand output tokens, with input counted at a fifth of that. Every plan includes an allowance, the product shows the cost before you run a generation, and the ledger records what each one actually cost." },
  { q: "Do you take a cut of ad spend?", a: "No. Ad spend goes straight to the network on your own payment method. We never touch it and never take a percentage." },
  { q: "How do I cancel?", a: "Settings, Billing, Cancel subscription. One click, online, in the same place you signed up. No phone call and no retention script." },
];

export default function PricingPage() {
  return (
    <PageShell>
      <PageHeader
        title="One plan. Everything in it."
        lede="Priced per workspace, so an agency pays for the clients it has and a single business pays for one brand. No feature is held back for a higher tier."
      />

      <Section id="plans">
        <PriceCards />
      </Section>

      <Section id="whats-included" heading="What is included" tone="muted">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h3 className="text-base font-semibold text-base-content">In every workspace</h3>
            <ul className="mt-4 space-y-3">
              {INCLUDED.map((i) => (
                <li key={i} className="flex gap-3 text-base leading-relaxed text-secondary">
                  <span aria-hidden="true" className="mt-0.5 font-semibold text-base-content">
                    &#10003;
                  </span>
                  <span>{i}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-base font-semibold text-base-content">Billed separately</h3>
            <dl className="mt-4 space-y-5">
              {METERED.map((m) => (
                <div key={m.label}>
                  <dt className="text-base font-medium text-base-content">{m.label}</dt>
                  <dd className="mt-1 text-base leading-relaxed text-secondary">{m.detail}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-sm leading-relaxed text-secondary">
              The full terms — renewals, price-change notice, refunds and failed payments — are in our{" "}
              <Link href="/subscription-terms" className="font-medium text-base-content underline underline-offset-3">
                subscription terms
              </Link>
              .
            </p>
          </div>
        </div>
      </Section>

      <Section id="faq" heading="Questions people actually ask">
        <dl className="grid gap-x-12 gap-y-8 md:grid-cols-2">
          {FAQ.map((f) => (
            <div key={f.q}>
              <dt className="text-base font-semibold text-base-content">{f.q}</dt>
              <dd className="mt-2 text-base leading-relaxed text-secondary">{f.a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-10">
          <Link href={AUTH_LINKS.signup} className={buttonClasses({ color: "primary" })}>
            Start free trial
          </Link>
        </p>
      </Section>

      <CtaBand heading="Try it before you pay for it" body={`${TRIAL_DAYS} days, every feature, no card required to start.`} />
    </PageShell>
  );
}
