import type { LegalSection } from "../types";

export const DATA_SECTIONS: LegalSection[] = [
  {
    id: "what-we-collect",
    heading: "What we collect and why",
    blocks: [
      "We collect the categories below. Where a legal basis is listed it applies to people protected by the UK/EU GDPR.",
      {
        table: {
          head: ["Category", "Examples", "Why", "Legal basis"],
          rows: [
            ["Account", "Name, email address, hashed password, two-factor secret and backup codes, session records, IP address and user agent of each session", "Create and secure your account; show you your active sessions", "Contract; legitimate interests in account security"],
            ["Organization and workspace", "Organization and workspace names, membership, roles, invitations, agency-client relationships", "Enforce who can see and do what", "Contract"],
            ["Connected channels", "Provider account and page identifiers, display names, avatars, granted scopes, capability and health status, access and refresh tokens", "Publish on your behalf, read your inbox, and retrieve your metrics", "Contract"],
            ["Content", "Draft and published posts, per-channel variants, captions, alt text, campaigns, approval decisions, comments, version history", "Deliver the core product", "Contract"],
            ["Media", "Images, video, documents you upload, plus derived renditions, checksums, alt text, and rights or expiry you record", "Store and publish your assets", "Contract"],
            ["Conversations", "Comments, mentions, direct messages and reviews retrieved from connected channels, including the sender's platform handle, display name, avatar and message body; your replies and internal notes", "Operate the Inbox. **We process this as a processor for our customer**", "Customer's instructions (see the [DPA](/dpa))"],
            ["Measurement", "Post and channel insights, ad spend and results, conversion events from GA4, Shopify or a signed webhook source", "Produce analytics and reports", "Contract"],
            ["Billing", "Plan, subscription status, invoices, credit and AI usage ledger entries, billing contact, last four digits and card brand", "Charge you and show your usage", "Contract; legal obligation for tax records"],
            ["Support and marketing", "Messages you send us, demo requests, newsletter subscriptions", "Answer you; send material you asked for", "Legitimate interests; consent for marketing email"],
            ["Audit and security", "Append-only records of sensitive actions with actor, workspace, action and timestamp", "Security, abuse investigation, and customer audit obligations", "Legitimate interests; legal obligation"],
          ],
        },
      },
    ],
  },
  {
    id: "telemetry",
    heading: "Product telemetry and logs",
    blocks: [
      "We record product events such as workspace_created, channel_connected, draft_created, approval_requested, post_scheduled, post_published, post_failed, conversation_replied, campaign_created and report_exported, together with opaque user and workspace identifiers, the surface you were on, the outcome, and how long the operation took.",
      "**Telemetry never contains message bodies, post text, media, access tokens, or contact details.** Server logs are structured, carry a request identifier, and are retained on a short rolling window.",
    ],
  },
  {
    id: "platform-data",
    heading: "Data from Meta, LinkedIn, TikTok and other networks",
    blocks: [
      "When you connect a channel we receive Platform Data from that network. We handle it under both this policy and the network's own developer terms.",
      {
        list: [
          "We request the **narrowest scopes** that make the features you use work, and we tell you which scopes a connection holds on the Connected accounts screen.",
          "We use Platform Data **only** to provide RocketEase to you: publishing, scheduling, inbox, analytics and reporting inside your workspace.",
          "We do **not** sell Platform Data, use it for advertising or profiling, license it to data brokers, or use it to train machine-learning models.",
          "Access tokens are encrypted at rest with AES-256-GCM in envelopes cryptographically bound to the record that holds them. They are never written to logs, never returned by our API, and never shown in the interface.",
          "**When you disconnect a channel we revoke the token with the provider where the provider supports revocation, delete the stored token immediately, and delete or de-identify the Platform Data cached for that channel.** See [Data deletion](/data-deletion).",
          "Content that we published to a network on your behalf remains on that network. Deleting it in RocketEase does not delete it there, and we tell you so at the point of deletion.",
        ],
      },
    ],
  },
  {
    id: "ai",
    heading: "AI features",
    blocks: [
      "RocketEase can draft post copy and generate images. When you use those features, the prompt you write and the brand information you have entered are sent to our model provider (listed on our [subprocessors page](/subprocessors)) to produce the output.",
      {
        list: [
          "**Your prompts and content are not used to train our provider's models.** We use the provider's API under terms that exclude training on customer inputs and outputs.",
          "Generated output belongs to you, subject to the [Terms of Service](/terms). You are responsible for reviewing it before it is published.",
          "Generated output can be wrong, biased, or resemble existing work. Do not publish it without human review.",
          "We record the fact and cost of each generation in your usage ledger so you can see what you were charged for.",
        ],
      },
    ],
  },
  {
    id: "retention",
    heading: "How long we keep it",
    blocks: [
      {
        table: {
          head: ["Record", "Retention"],
          rows: [
            ["Workspace content, media and conversations", "For the life of the workspace. Deleted or returned within 30 days of account closure, subject to the [DPA](/dpa)"],
            ["Provider access tokens", "Deleted immediately on disconnect, on account closure, or when the provider revokes them"],
            ["Audit events", "Retained for the life of the organization; append-only and not editable, including by us"],
            ["Server logs and request traces", "30 days"],
            ["Product telemetry", "24 months, in aggregated or pseudonymous form"],
            ["Billing and tax records", "7 years, as required by law"],
            ["Support correspondence", "24 months after the conversation closes"],
            ["Backups", "Rolling 35 days, after which deleted records age out"],
          ],
        },
      },
      "Where a legal hold, dispute, or audit obligation applies, we keep the affected records until it lifts, and no longer.",
    ],
  },
];
