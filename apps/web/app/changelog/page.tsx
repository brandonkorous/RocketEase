import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { Section, Prose } from "@/components/marketing/section";
import { CtaBand } from "@/components/marketing/cta-band";

export const metadata: Metadata = {
  title: "What's new — RocketEase",
  description: "What has been built in RocketEase, in the order it was built, and what we will publish here once the product is generally available.",
};

const BUILT = [
  { area: "Monetise and generate", items: ["AI usage ledger with per-generation cost", "Stripe per-workspace billing with AI overage meters", "Post and ad generation", "Agency per-client economics"] },
  { area: "Brand hub", items: ["Brand moved out of Settings into a first-level area", "Identity, voice, visual identity, approved messaging with dated offers, audiences and compliance rules", "Drafting and client reports read from it"] },
  { area: "Campaigns and paid", items: ["Ad account import and campaign detail", "Promoted-post lineage", "Spend and conversion reporting", "Budget permissions and audit"] },
  { area: "Analytics and reports", items: ["Analytics overview, content, channel and campaign reports", "Conversion tracking via GA4, Shopify and signed webhooks", "Paid and organic split with published metric definitions", "Saved, exported and scheduled reports"] },
  { area: "Unified inbox", items: ["Comments, mentions, messages and reviews in one queue", "Webhook ingestion with polling reconciliation", "Replies reconciled before any resend", "Saved replies, internal notes and assignment"] },
  { area: "Approvals and collaboration", items: ["Approval queue with preview, diff and version history", "Client approver links", "Stale-version handling"] },
  { area: "Compose, schedule, publish", items: ["Per-channel variants with provider-current validation", "Idempotent publishing with reconciliation before retry", "Calendar with drag-to-reschedule and bulk actions"] },
  { area: "Connect and content", items: ["Provider adapter contract with capability modelling per channel", "OAuth with explicit channel selection", "AES-256-GCM token envelopes bound to the record id", "Content library with rights, expiry and malware scanning"] },
  { area: "Foundations", items: ["Organization and workspace tenancy with eight roles", "Server-enforced tenant gate", "Append-only audit log", "TOTP two-factor, session revocation, SAML SSO and SCIM"] },
];

export default function ChangelogPage() {
  return (
    <PageShell>
      <PageHeader
        title="What's new"
        lede="RocketEase is not generally available yet, so there are no dated releases to list. Here is what has actually been built, newest first."
      />

      <Section id="note">
        <Prose>
          <p>
            A changelog with invented version numbers and release dates would look more finished than the product is. When RocketEase
            goes generally available, this page becomes a dated release log and each entry will link to what changed. Until then it is
            an honest inventory.
          </p>
          <p>
            What is gating general availability is provider app review — the adapters are written; the networks approve on their own
            timetable. Current status per network is on the{" "}
            <Link href="/integrations" className="font-medium text-base-content underline underline-offset-3">
              integrations page
            </Link>
            .
          </p>
        </Prose>
      </Section>

      <Section id="built" heading="Built so far" tone="muted">
        <ol className="space-y-px overflow-hidden rounded-box border border-base-300 bg-base-300">
          {BUILT.map((b) => (
            <li key={b.area} className="bg-base-100 p-6 lg:p-7">
              <h2 className="text-base font-semibold text-base-content">{b.area}</h2>
              <ul className="mt-3 grid gap-2 text-sm text-secondary sm:grid-cols-2">
                {b.items.map((i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true" className="text-base-content">
                      &middot;
                    </span>
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Section>

      <CtaBand heading="Want to be told when it ships?" body="Start a trial now, or tell us to email you when general availability lands." />
    </PageShell>
  );
}
