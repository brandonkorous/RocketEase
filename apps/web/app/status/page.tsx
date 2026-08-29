import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { Section, Prose } from "@/components/marketing/section";
import { CONTACT } from "@/lib/site";

export const metadata: Metadata = {
  title: "Status — RocketEase",
  description: "Where to check RocketEase availability, what we commit to telling you during an incident, and how connected-network outages are surfaced.",
};

export default function StatusPage() {
  return (
    <PageShell>
      <PageHeader
        title="Service status"
        lede="What we commit to telling you when something is wrong — including the part most status pages leave out, which is what happens to your scheduled posts."
      />

      <Section id="in-product">
        <Prose>
          <p>
            <strong className="font-semibold text-base-content">
              A dedicated status host is not live yet, so the product itself is the source of truth today.
            </strong>{" "}
            Connection health is shown per channel on Connected accounts, with the state, the last successful sync, and an error
            summary when there is one. That is more specific than a global green dot, because most outages affect one network rather
            than all of them.
          </p>
        </Prose>
      </Section>

      <Section id="network-outages" heading="When a network has the outage" tone="muted">
        <Prose>
          <p>
            Most disruption to social marketing tools originates at the networks, not at the tool. When Instagram, Facebook, LinkedIn
            or TikTok is degraded, RocketEase does three things:
          </p>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              Moves the affected channel into a <span className="font-medium text-base-content">degraded</span> or{" "}
              <span className="font-medium text-base-content">action required</span> state, with the reason, rather than silently
              failing.
            </li>
            <li>
              <strong className="font-semibold text-base-content">Holds scheduled posts rather than burning them.</strong> A post that
              cannot publish during an outage is not marked failed and abandoned — it is retried on backoff, and only after we have
              reconciled with the network to confirm it did not already go out.
            </li>
            <li>
              Lets us disable a single provider capability with a feature flag, without a deployment, so one broken endpoint does not
              take a whole network offline for you.
            </li>
          </ul>
        </Prose>
      </Section>

      <Section id="commitments" heading="What we commit to">
        <Prose>
          <ul className="ml-5 list-disc space-y-2">
            <li>Email to affected workspaces when an incident affects publishing, the inbox, or your data.</li>
            <li>A written explanation afterwards for anything that affected publishing — what happened, what we did, what changes.</li>
            <li>
              Notification within 48 hours of becoming aware of a security breach affecting your data. That one is contractual, in
              section 8 of our{" "}
              <Link href="/dpa" className="font-medium text-base-content underline underline-offset-3">
                data processing addendum
              </Link>
              , not a promise on a marketing page.
            </li>
            <li>
              No uptime percentage on this page. We have not operated long enough to have a meaningful one, and a number without
              history behind it is decoration.
            </li>
          </ul>
        </Prose>
      </Section>

      <Section id="report" heading="Something looks wrong?" tone="muted">
        <Prose>
          <p>
            Email{" "}
            <a href={`mailto:${CONTACT.support}`} className="font-medium text-base-content underline underline-offset-3">
              {CONTACT.support}
            </a>{" "}
            with your workspace name, the channel, and roughly when it started. If it is a security issue, use{" "}
            <a href={`mailto:${CONTACT.security}`} className="font-medium text-base-content underline underline-offset-3">
              {CONTACT.security}
            </a>{" "}
            and read our{" "}
            <Link href="/security" className="font-medium text-base-content underline underline-offset-3">
              disclosure policy
            </Link>{" "}
            first.
          </p>
        </Prose>
      </Section>
    </PageShell>
  );
}
