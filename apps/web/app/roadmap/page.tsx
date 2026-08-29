import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { Section, Prose } from "@/components/marketing/section";
import { CtaBand } from "@/components/marketing/cta-band";

export const metadata: Metadata = {
  title: "Roadmap — RocketEase",
  description: "What RocketEase has built, what is next, and why we publish outcomes and gates rather than dates.",
};

type Phase = { name: string; outcome: string; state: "done" | "current" | "next"; items: string[]; gate: string };

const PHASES: Phase[] = [
  {
    name: "Foundations",
    outcome: "A secure, testable product skeleton.",
    state: "done",
    items: ["Organization and workspace tenancy with eight roles", "Audit log, design system, accessible shell", "Provider adapter contract and OAuth flow", "Media pipeline, publish idempotency and reconciliation", "CI, observability, metric dictionary"],
    gate: "Tenant isolation and a sandbox post demonstrated end to end.",
  },
  {
    name: "Plan and publish",
    outcome: "An activated workspace can reliably schedule cross-channel content.",
    state: "done",
    items: ["Onboarding, connected accounts, content library", "Composer with per-channel variants, calendar, drafts and versions", "Scheduling, publishing, failure recovery, notifications", "Approvals and collaboration"],
    gate: "Duplicate-publish controls proven; publish reliability meets threshold.",
  },
  {
    name: "Engage",
    outcome: "Teams can manage inbound social work with ownership and context.",
    state: "done",
    items: ["Unified inbox with assignment, status, notes and saved replies", "Reply delivery with reconciliation before retry", "Client approver links and agency overview", "Connection health operations"],
    gate: "Reply reconciliation reliable; agency isolation tests pass.",
  },
  {
    name: "Understand",
    outcome: "Teams can explain cross-channel content and campaign performance.",
    state: "done",
    items: ["Analytics overview, content, channel and campaign reports", "Paid and organic split, provider metric definitions", "Conversion tracking with GA4, Shopify and signed webhooks", "CSV export, saved and scheduled reports"],
    gate: "Provider totals reconcile within documented rules; every metric has a published contract.",
  },
  {
    name: "Promote",
    outcome: "Users connect organic winners to paid promotion safely.",
    state: "current",
    items: ["Ad account import and campaign detail", "Promoted-post lineage and spend reporting", "Budget permissions, confirmations, caps and audit", "Step-up re-authentication before any spend-changing action"],
    gate: "Spend workflows pass security review and provider certification.",
  },
  {
    name: "Improve and expand",
    outcome: "The system helps teams repeat what works.",
    state: "next",
    items: ["Explainable recommendations and best-time analysis", "Content reuse and automation rules with approval gates", "Additional providers as approvals allow", "Enterprise SSO and SCIM, advanced agency reporting"],
    gate: "Recommendations must explain themselves or they do not ship.",
  },
];

const STATE_LABEL = { done: "Shipped", current: "In progress", next: "Next" } as const;

export default function RoadmapPage() {
  return (
    <PageShell>
      <PageHeader
        title="Roadmap"
        lede="Outcome-based, and deliberately undated. Dates here would depend on provider approvals we do not control, so we publish the outcome and the gate that has to close instead."
      />

      <Section id="phases">
        <ol className="space-y-px overflow-hidden rounded-box border border-base-300 bg-base-300">
          {PHASES.map((p) => (
            <li key={p.name} className="bg-base-100 p-6 lg:p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-xl font-semibold text-base-content">{p.name}</h2>
                <span className="rounded-selector border border-base-300 px-2 py-0.5 text-xs font-semibold text-secondary">
                  {STATE_LABEL[p.state]}
                </span>
              </div>
              <p className="mt-2 text-base text-secondary">{p.outcome}</p>
              <ul className="mt-4 grid gap-2 text-sm text-secondary sm:grid-cols-2">
                {p.items.map((i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true" className="text-base-content">
                      &middot;
                    </span>
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-base-300 pt-4 text-sm text-secondary">
                <span className="font-semibold text-base-content">Gate:</span> {p.gate}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="caveat" heading="Two honest caveats" tone="muted">
        <Prose>
          <p>
            <strong className="font-semibold text-base-content">Provider approval gates everything.</strong> Instagram, Facebook,
            LinkedIn and TikTok adapters are written and tested against our own contract suite, but each network reviews apps on its
            own timetable. Current status for every connection is on the{" "}
            <Link href="/integrations" className="font-medium text-base-content underline underline-offset-3">
              integrations page
            </Link>
            , and we update it as reviews conclude.
          </p>
          <p>
            <strong className="font-semibold text-base-content">Shipped means built and tested, not battle-hardened.</strong> The
            phases above are complete against their gates and verified end to end. They have not yet been through years of production
            traffic, and we are not going to imply otherwise.
          </p>
        </Prose>
      </Section>

      <CtaBand heading="Want something that is not here?" body="Tell us what would make the difference. We read every one." />
    </PageShell>
  );
}
