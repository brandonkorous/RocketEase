import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/marketing/section";
import { CONTACT, ENTITY, formattedAddress } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact — RocketEase",
  description: "How to reach RocketEase: support, sales, privacy requests, copyright notices, security reports and legal notices.",
};

const ROUTES = [
  { title: "Support", email: CONTACT.support, body: "Something is broken, or you cannot work out how to do something. Include your workspace name and what you were trying to do.", sla: "We aim to reply within one business day." },
  { title: "Sales and demos", email: CONTACT.general, body: "Questions about fit, pricing, agency setup or migrating from another tool.", sla: "We aim to reply within one business day." },
  { title: "Privacy requests", email: CONTACT.privacy, body: "Access, correction, deletion, portability, or any other data right. Most of it you can do yourself in Settings — see data deletion.", sla: "Answered within 30 days, or 45 where the law allows and we tell you why.", href: "/data-deletion" },
  { title: "Security reports", email: CONTACT.security, body: "Vulnerability disclosures. We will not pursue legal action against good-faith research that follows our policy.", sla: "Acknowledged within 3 business days.", href: "/security" },
  { title: "Copyright notices", email: CONTACT.dmca, body: "DMCA takedown notices and counter-notices. There are specific requirements — a notice missing any of them may not be effective.", sla: "Acted on expeditiously.", href: "/copyright" },
  { title: "Legal notices", email: CONTACT.legal, body: "Contract questions, a countersigned DPA, or formal notice under the Terms of Service.", sla: "Formal notice also requires a copy by post.", href: "/terms" },
  { title: "Accessibility", email: CONTACT.support, body: "Tell us where the product failed you, and which assistive technology and browser you were using.", sla: "Treated as a bug, not a feature request.", href: "/accessibility" },
];

export default function ContactPage() {
  return (
    <PageShell>
      <PageHeader
        title="Contact us"
        lede="Every route below reaches a person. We have deliberately not put a contact form here that drops your message into a queue nobody names."
      />

      <Section id="routes">
        <ul className="grid gap-px overflow-hidden rounded-box border border-base-300 bg-base-300 md:grid-cols-2">
          {ROUTES.map((r) => (
            <li key={r.title} className="bg-base-100 p-6 lg:p-7">
              <h2 className="text-base font-semibold text-base-content">{r.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-secondary">{r.body}</p>
              <p className="mt-4">
                <a href={`mailto:${r.email}`} className="text-base font-medium text-base-content underline underline-offset-3">
                  {r.email}
                </a>
              </p>
              <p className="mt-2 text-sm text-secondary">
                {r.sla}
                {r.href && (
                  <>
                    {" "}
                    <Link href={r.href} className="font-medium text-base-content underline underline-offset-3">
                      Read the policy
                    </Link>
                    .
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="post" heading="By post" tone="muted">
        <address className="text-base not-italic leading-relaxed text-secondary">
          {ENTITY.legalName}
          <br />
          {formattedAddress()}
        </address>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-secondary">
          This is also the address for our designated copyright agent and for formal notice under the{" "}
          <Link href="/terms" className="font-medium text-base-content underline underline-offset-3">
            Terms of Service
          </Link>
          .
        </p>
      </Section>
    </PageShell>
  );
}
