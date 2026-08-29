import type { LegalDoc } from "./types";
import { CONTACT, LEGAL_EFFECTIVE } from "@/lib/site";

export const SECURITY: LegalDoc = {
  slug: "security",
  title: "Security",
  heading: "Security at RocketEase",
  lede: "How we protect your data and your customers' conversations, what we have not done yet, and how to report a vulnerability.",
  updated: LEGAL_EFFECTIVE,
  sections: [
    {
      id: "honest-status",
      heading: "Where we actually are",
      blocks: [
        {
          note: "**We do not hold a SOC 2 report, an ISO 27001 certificate, or any third-party audit attestation.** We are a young company and we are not going to imply otherwise. What follows is a description of controls we have actually built, so you can assess them yourself. If your procurement process requires an attestation we do not have, tell us — we would rather lose the deal than misrepresent our posture.",
        },
      ],
    },
    {
      id: "tenancy",
      heading: "Tenant isolation",
      blocks: [
        "This is the control that matters most in a multi-tenant product, so it is the one we designed first.",
        {
          list: [
            "Every workspace-scoped record carries an organization identifier and a workspace identifier. There is no table where tenancy is implied rather than stored.",
            "**Authorization is enforced on the server for every request**, by a helper that verifies membership before any data is read. Client-side checks are convenience only, and the edge middleware is an optimistic cookie check that we never treat as authorization.",
            "A user who is not a member of a workspace cannot learn that it exists. Non-membership and non-existence return the same response — no existence leak.",
            "Tenant isolation is covered by database-level automated tests that run on every change in CI. A change that could cross a tenant boundary fails the build.",
          ],
        },
      ],
    },
    {
      id: "credentials",
      heading: "Your social account tokens",
      blocks: [
        "Access tokens for your connected channels are the most sensitive thing we hold, because they can publish as you.",
        {
          list: [
            "Tokens are sealed in **AES-256-GCM envelopes cryptographically bound to the database row that holds them**, so a token lifted from one row cannot be decrypted in the context of another.",
            "The master key lives in Azure Key Vault, is set by hand, and is never managed by our infrastructure code — which also means it cannot be rotated out from under your connections by a deployment.",
            "Envelopes carry a key identifier, so keys can be rotated without downtime.",
            "**Tokens are never written to logs, never returned by our API, and never rendered in the interface.**",
            "On disconnect we revoke with the provider where the provider supports it, then delete our copy immediately.",
          ],
        },
      ],
    },
    {
      id: "account-security",
      heading: "Account security",
      blocks: [
        {
          list: [
            "TOTP two-factor authentication with single-use backup codes.",
            "A session list showing every active session with its IP address and device, and one-click revocation.",
            "Step-up re-authentication before high-risk actions.",
            "SAML single sign-on and SCIM user provisioning for organizations that need them.",
            "Role-based permissions across eight workspace roles, so a client approver sees only what they should.",
            "Append-only audit records of sensitive actions, visible to your administrators and not editable by anyone — including us.",
          ],
        },
      ],
    },
    {
      id: "infrastructure",
      heading: "Infrastructure",
      blocks: [
        {
          list: [
            "Hosted on Microsoft Azure in the United States. TLS 1.2 or better everywhere; encryption at rest for database and object storage.",
            "**The database has no public network access.** The application connects as a restricted role that cannot execute schema changes at runtime.",
            "Schema migrations run as an in-cluster job — never from a laptop or a CI runner.",
            "Managed PostgreSQL with point-in-time restore and a rolling 35-day backup window.",
            "Uploaded media is scanned for malware before it can be published, and unscanned assets are blocked from publishing.",
            "Structured logs with request identifiers. **Logs and telemetry exclude message bodies, post text, media and credentials by design**, not by redaction after the fact.",
          ],
        },
      ],
    },
    {
      id: "development",
      heading: "How we build",
      blocks: [
        {
          list: [
            "Code review on every change; typed end to end; automated tests including the tenant-isolation suite and end-to-end browser tests, all gating CI.",
            "Dependency scanning, with security updates prioritised over feature work.",
            "Publishing is idempotent and reconciles with the provider before any retry, so a network hiccup cannot double-post on your behalf.",
            "Feature kill switches let us disable a single provider capability without a deployment if a network misbehaves.",
          ],
        },
      ],
    },
    {
      id: "incidents",
      heading: "If something goes wrong",
      blocks: [
        "**We will tell you within 48 hours of becoming aware of a breach affecting your data**, with what we know at the time and updates as we learn more. That commitment is contractual — it is in section 8 of our [DPA](/dpa), not just a promise on a marketing page.",
        "We will notify regulators where the law requires it, and we will not quietly wait out a disclosure deadline.",
      ],
    },
    {
      id: "disclosure",
      heading: "Reporting a vulnerability",
      blocks: [
        `Email [${CONTACT.security}](mailto:${CONTACT.security}) with enough detail to reproduce the issue. We acknowledge within 3 business days and keep you updated until it is resolved.`,
        {
          list: [
            "**We will not pursue legal action** against researchers who act in good faith, report privately, give us reasonable time to fix the issue, and do not access, modify or destroy data belonging to anyone else.",
            "Do not run automated scanning against production, do not degrade the service, and do not access another customer's data. If you can prove an isolation flaw without reading real data, do that instead — and tell us how.",
            "We do not currently run a paid bug bounty. We will credit you publicly if you want the credit.",
          ],
        },
      ],
    },
  ],
};
