import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/marketing/section";
import { CONTACT, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Help center — RocketEase",
  description: "Getting started with RocketEase, answers to common questions, and how to reach a person when the answer is not here.",
};

const TOPICS = [
  {
    title: "Getting started",
    items: [
      { q: "Create your organization and first workspace", a: "Sign up, name your organization, then name your first workspace — one brand or one client. Onboarding walks the rest." },
      { q: "Connect a social account", a: "Connected accounts, choose the network, review the access being requested in plain language, then explicitly pick which pages or profiles belong to this workspace. We never assume the first account returned is the right one." },
      { q: "Publish your first post", a: "Create, write the shared content, tune any per-channel variants, add alt text, pick a time. The calendar's empty state walks you through it if you would rather be shown." },
      { q: "Invite your team", a: "Settings, Team, Invite. Pick one of eight roles — a client approver sees a preview and two buttons; a strategist sees the calendar." },
    ],
  },
  {
    title: "Publishing",
    items: [
      { q: "Why did my post fail?", a: "Open the post. The failure carries a category — permission, validation, rate limit, temporary provider failure, deleted remote object, or policy restriction — and what to do about it, rather than a provider error code." },
      { q: "Will a retry double-post?", a: "No. Every publish carries an idempotency key, and after an ambiguous provider error we look the post up on the network before we retry anything." },
      { q: "Why can this channel not post a reel?", a: "Capability is modelled per connected channel, with a reason and a last-checked time. Open the channel on Connected accounts to see exactly what it supports and why." },
      { q: "Deleting a post here did not delete it on Instagram", a: "Correct, and deliberate. Content published to a network lives on that network. We tell you this at the point of deletion; remove it at the network." },
    ],
  },
  {
    title: "Analytics",
    items: [
      { q: "Why does a metric say unavailable instead of 0?", a: "Because zero would look like a real result. When a network stops reporting a metric, or a permission is missing, we name the reason instead." },
      { q: "Why do your conversion numbers differ from Meta's?", a: "Because we refuse to double-count. A paid utm_medium is credited to the ad platform; everything else is credited to your tracking source. Adding two dashboards together sells the same order twice." },
      { q: "How is ROAS calculated?", a: "Paid-medium revenue divided by spend. One definition, stated on the report, not a configurable that quietly flatters the number." },
    ],
  },
  {
    title: "Account and billing",
    items: [
      { q: "How do I cancel?", a: "Settings, Billing, Cancel subscription. Online, one click, in the same place you signed up." },
      { q: "What is an AI credit?", a: "One credit is a thousand output tokens, input counted at a fifth. The cost is shown before you run a generation and recorded in the ledger afterwards." },
      { q: "How do I delete my data?", a: "Settings, Data and privacy — or read the full walkthrough on our data deletion page, which covers channels, workspaces and whole accounts." },
    ],
  },
];

export default function HelpPage() {
  return (
    <PageShell>
      <PageHeader
        title="Help center"
        lede="The questions we get asked most. If yours is not here, a person will answer it — we do not have a bot standing between you and support."
      />

      {TOPICS.map((topic, i) => (
        <Section key={topic.title} id={topic.title.toLowerCase().replace(/\s+/g, "-")} heading={topic.title} tone={i % 2 ? "muted" : "base"}>
          <dl className="grid max-w-4xl gap-x-12 gap-y-7 md:grid-cols-2">
            {topic.items.map((item) => (
              <div key={item.q}>
                <dt className="text-base font-semibold text-base-content">{item.q}</dt>
                <dd className="mt-2 text-base leading-relaxed text-secondary">{item.a}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ))}

      <Section id="more" heading="Still stuck?">
        <p className="max-w-2xl text-base leading-relaxed text-secondary">
          Email{" "}
          <a href={`mailto:${CONTACT.support}`} className="font-medium text-base-content underline underline-offset-3">
            {CONTACT.support}
          </a>{" "}
          with your workspace name and what you were trying to do. We aim to reply within one business day. Current service
          availability is on the{" "}
          <Link href="/status" className="font-medium text-base-content underline underline-offset-3">
            status page
          </Link>
          , and the product itself is at{" "}
          <a href={SITE.appUrl} className="font-medium text-base-content underline underline-offset-3">
            {SITE.appUrl.replace("https://", "")}
          </a>
          .
        </p>
      </Section>
    </PageShell>
  );
}
