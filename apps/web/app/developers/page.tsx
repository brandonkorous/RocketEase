import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { Section, Prose } from "@/components/marketing/section";
import { CtaBand } from "@/components/marketing/cta-band";
import { CONTACT, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "API and developers — RocketEase",
  description: "The RocketEase API: what it covers today, how authentication and tenancy work, and what is not built yet.",
};

const ENDPOINTS = [
  { method: "GET", path: "/api/v1/workspace", what: "The workspace the token is scoped to." },
  { method: "GET", path: "/api/v1/channels", what: "Connected channels with capability and health state." },
  { method: "GET POST", path: "/api/v1/drafts", what: "List drafts, or create one with per-channel variants." },
  { method: "POST", path: "/api/v1/drafts/:id/submit", what: "Submit a draft into the approval or scheduling flow." },
  { method: "GET PATCH", path: "/api/v1/items/:id", what: "Read or update a content item and its variants." },
  { method: "GET", path: "/api/v1/conversations", what: "Inbox conversations, filterable by channel, status and assignee." },
  { method: "POST", path: "/api/v1/conversations/:id/reply-draft", what: "Stage a reply for a human to review and send." },
  { method: "GET", path: "/api/v1/metrics", what: "Metrics with their provider definitions, grain, timezone and freshness." },
];

export default function DevelopersPage() {
  return (
    <PageShell>
      <PageHeader
        title="API and developers"
        lede="A small, honest API surface. It covers the things people actually automate, and we would rather ship eight endpoints that work than forty that mostly do."
      />

      <Section id="principles" heading="How it works">
        <Prose>
          <p>
            <strong className="font-semibold text-base-content">Tenancy is enforced the same way as the product.</strong> A token is
            scoped to one workspace. There is no endpoint that lets a token reach across workspaces, and non-membership and
            non-existence return the same response — the API leaks no more than the interface does.
          </p>
          <p>
            <strong className="font-semibold text-base-content">Mutations are audited.</strong> Anything the audit list covers is
            recorded with the token as the actor, so an automated action is as traceable as a human one.
          </p>
          <p>
            <strong className="font-semibold text-base-content">Publishing goes through the same path as the UI.</strong> The API
            does not offer a shortcut around validation, idempotency or reconciliation. An automation cannot double-post in a way a
            person could not.
          </p>
          <p>
            <strong className="font-semibold text-base-content">Replies are staged, not sent.</strong> The conversation endpoint
            drafts a reply for a human to review. We are not going to hand out an endpoint that lets a script talk to your customers
            unattended.
          </p>
        </Prose>
      </Section>

      <Section id="endpoints" heading="What exists today" tone="muted">
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-300">
                <th className="px-5 py-3 text-left font-semibold text-base-content">Method</th>
                <th className="px-5 py-3 text-left font-semibold text-base-content">Path</th>
                <th className="px-5 py-3 text-left font-semibold text-base-content">What it does</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={e.path} className="border-b border-base-300 last:border-0">
                  <td className="px-5 py-3 align-top font-mono text-xs text-secondary">{e.method}</td>
                  <td className="px-5 py-3 align-top font-mono text-xs text-base-content">{e.path}</td>
                  <td className="px-5 py-3 align-top text-secondary">{e.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-secondary">
          Base URL is <span className="font-mono text-sm text-base-content">{SITE.appUrl}</span>. Authenticate with a workspace API
          token created in Settings. Tokens are shown once and stored hashed.
        </p>
      </Section>

      <Section id="not-yet" heading="What is not built yet">
        <Prose>
          <p>
            There is <strong className="font-semibold text-base-content">no public webhook subscription API</strong>, no OAuth app
            platform for third-party developers, no SDK, and no sandbox tenant. We receive webhooks from social networks; we do not
            yet emit them to you.
          </p>
          <p>
            Reference documentation is not published either. If you are building against this, email{" "}
            <a href={`mailto:${CONTACT.support}`} className="font-medium text-base-content underline underline-offset-3">
              {CONTACT.support}
            </a>{" "}
            and we will send you the current schemas directly and tell you before anything changes.
          </p>
          <p>
            Enterprise identity is further along: <Link href="/security" className="font-medium text-base-content underline underline-offset-3">SAML single sign-on and SCIM user provisioning</Link>{" "}
            are built and working.
          </p>
        </Prose>
      </Section>

      <CtaBand heading="Building something against the API?" body="Tell us what you need and we will make sure it keeps working." />
    </PageShell>
  );
}
