import type { Feature } from "@/components/marketing/feature-grid";

export const LIFECYCLE_STEPS = [
  { title: "Plan", body: "One calendar across every channel, with campaigns, approvals and a brand hub the work reads from." },
  { title: "Publish", body: "Compose once, tune per channel, schedule, and let idempotent publishing get it there or tell you why not." },
  { title: "Engage", body: "Comments, mentions, messages and reviews in one queue, with replies that reconcile before they retry." },
  { title: "Measure", body: "Organic and paid in one view, with conversion attribution that refuses to double-count." },
];

export const PLAN_FEATURES: Feature[] = [
  {
    title: "Calendar",
    body: "Month, week and list views across every connected channel, filtered by campaign, status, assignee or network.",
    detail: ["Drag to reschedule", "Bulk actions", "Timezone-aware", "Previews before you commit"],
  },
  {
    title: "Campaigns",
    body: "The container that holds organic and paid together — objective, dates, owner, channels, spend and outcomes in one record.",
    detail: ["Overview, Content, Ads, Audience, Conversations, Performance, Activity"],
  },
  {
    title: "Brand hub",
    body: "Identity, voice, palette, typography, approved messaging with dated offers, audiences and compliance rules.",
    detail: ["Every fact entered by a person — the product never infers a brand fact", "Drafting and reports read from it"],
  },
  {
    title: "Content library",
    body: "Assets with alt text, tags, folders, rights and expiry, plus the usage references that stop you deleting something a scheduled post needs.",
    detail: ["Direct-to-storage uploads", "Automatic renditions", "Malware scanning before publish"],
  },
];

export const PUBLISH_FEATURES: Feature[] = [
  {
    title: "Compose once, tune per channel",
    body: "Shared content with per-channel variants, so a caption that needs to differ on LinkedIn can, without maintaining four drafts.",
    detail: ["Per-network validation at execution time", "Accessibility fields in the flow, not buried"],
  },
  {
    title: "Publishing that does not double-post",
    body: "Every publish carries an idempotency key. After an ambiguous provider error we reconcile with the network before any retry, and we never retry a permanent failure.",
    detail: ["Errors mapped to actionable categories, not stack traces"],
  },
  {
    title: "Approvals",
    body: "A queue by status, due date, assignee or campaign, with preview, diff, comments, version history and stale-version handling.",
    detail: ["Client approver view is deliberately narrow"],
  },
  {
    title: "AI drafting and generation",
    body: "Draft copy and generate images from your brand hub. Metered in credits you can see as you spend them.",
    detail: ["Your prompts are never used to train models", "Human review before anything publishes"],
  },
];

export const ENGAGE_FEATURES: Feature[] = [
  {
    title: "One inbox",
    body: "Comments, mentions, direct messages and reviews from every connected channel in a single queue, deduplicated on channel and remote id.",
    detail: ["Webhooks where a network supports them, polling to reconcile"],
  },
  {
    title: "Replies you can trust",
    body: "An outbound reply that returns an ambiguous result is reconciled against the network before we consider resending, so your customer never gets the same answer twice.",
  },
  {
    title: "Context beside the thread",
    body: "Customer history, channel identity, SLA timestamps, saved replies and internal notes, without leaving the conversation.",
  },
];

export const MEASURE_FEATURES: Feature[] = [
  {
    title: "Organic and paid together",
    body: "Scorecards, trends, channel breakdown, campaign attribution and the paid/organic split in one place.",
    detail: ["Provider metric definitions, grain, timezone and freshness stored with the data"],
  },
  {
    title: "Conversion tracking that refuses to double-count",
    body: "A paid utm_medium belongs to the ad platform; everything else belongs to your tracking source. Site-reported and ad-reported conversions never both claim the same sale.",
    detail: ["GA4, Shopify, or your own signed webhook", "ROAS is paid-medium revenue divided by spend"],
  },
  {
    title: "Honest gaps",
    body: "A metric a network stopped reporting shows as unavailable with the reason — never as a zero that looks like a real result.",
  },
  {
    title: "Reports",
    body: "Save, export and schedule. Agency reports carry your logo and reply-to, and stay monochrome so the data leads.",
  },
];

export const FOUNDATION_FEATURES: Feature[] = [
  {
    title: "Tenancy enforced on the server",
    body: "Every workspace-scoped record carries an organization and workspace id, verified on the server for every request. Non-membership and non-existence look identical.",
  },
  {
    title: "Agencies as a first-class shape",
    body: "An overview across client workspaces, per-client economics, and eight workspace roles so a client approver sees only what they should.",
  },
  {
    title: "Security you can inspect",
    body: "TOTP two-factor, session revocation, SAML SSO, SCIM provisioning, and an append-only audit log nobody can edit — including us.",
  },
];
