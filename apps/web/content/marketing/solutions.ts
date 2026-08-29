import type { Feature } from "@/components/marketing/feature-grid";

export type Solution = {
  slug: string;
  title: string;
  heading: string;
  lede: string;
  problems: { title: string; body: string }[];
  features: Feature[];
  closing: string;
};

export const SOLUTIONS: Record<string, Solution> = {
  agencies: {
    slug: "agencies",
    title: "Agencies",
    heading: "Run every client from one place, without pretending they are the same",
    lede: "An agency does not have one brand voice, one approval chain or one reporting cadence — it has as many as it has clients. RocketEase is built around that instead of against it.",
    problems: [
      { title: "Switching costs you the day", body: "Logging in and out of client accounts, re-learning where each one keeps its assets, is the tax that makes a fifth client unprofitable." },
      { title: "Approvals stall in email", body: "A client who has to log into a tool they use twice a month will not. So the approval sits in a thread and the post misses the window." },
      { title: "Reporting is manual", body: "Screenshots pasted into a deck, once a month, for every client, by someone senior enough to interpret them." },
      { title: "Nobody knows which client is profitable", body: "Retainer in, hours out, ad spend through — but the margin per client lives in a spreadsheet that is always a month behind." },
    ],
    features: [
      { title: "Agency overview", body: "Every client workspace in one searchable list: upcoming work, overdue approvals, inbox backlog, failed posts, connection health and performance direction.", detail: ["No mutation without entering a workspace — you cannot post to the wrong client by accident"] },
      { title: "Eight workspace roles", body: "A client approver sees a preview and two buttons. A strategist sees the calendar. A contractor sees one campaign. Set per workspace, enforced on the server." },
      { title: "Per-client economics", body: "Retainer, cost, AI usage and ad spend per client, with a margin rate you set, so the answer to 'is this client worth it' is a screen rather than a spreadsheet." },
      { title: "White-labelled reports", body: "Your logo and reply-to address on scheduled client reports. Monochrome by design, so the data leads and the branding does not shout." },
      { title: "Brand hub per client", body: "Voice, palette, approved messaging with dated offers, compliance rules. New staff inherit the client's rules instead of guessing them." },
      { title: "One bill", body: "Priced per workspace. Add a client, add a workspace; lose one, remove it. No annual seat negotiation." },
    ],
    closing: "If you run more than three clients, the switching cost is the product problem. That is the one we solved first.",
  },
  "small-business": {
    slug: "small-business",
    title: "Small business",
    heading: "Social marketing that does not need a social media manager",
    lede: "Most businesses do not have someone whose job is posting. They have someone who already has a job, doing this as well. The product should assume that.",
    problems: [
      { title: "Posting is the easy part", body: "The hard part is deciding what to post, remembering to, and answering the person who replied three days ago." },
      { title: "Four apps, four inboxes", body: "A comment on Instagram, a message on Facebook, a review on Google — three places to check, so one gets missed." },
      { title: "The metrics do not mean anything", body: "Impressions went up. Did anyone buy anything? Most tools cannot tell you, and quietly imply they can." },
    ],
    features: [
      { title: "One calendar", body: "Everything going out, everywhere, on one screen. Drag to move it. The empty state teaches you the first post rather than staring at you." },
      { title: "One inbox", body: "Every comment, message, mention and review from every channel in one queue, so nothing waits three days." },
      { title: "Write once, adapt automatically", body: "Compose once and tune per channel where it matters. The product validates against each network's current rules before you schedule, not after it fails." },
      { title: "AI drafting from your brand", body: "Enter your voice, audience and offers once. Drafting reads from that instead of producing generic copy you have to rewrite." },
      { title: "Conversions, not vanity", body: "Connect GA4 or Shopify and see revenue attributed to your marketing. When a number is unavailable we say so rather than showing you a zero." },
      { title: "Approvals when you need them", body: "Route a post to the owner before it goes out. Or do not — it is off by default." },
    ],
    closing: "Everything is in one plan. There is no tier that withholds the inbox until you are big enough.",
  },
  ecommerce: {
    slug: "ecommerce",
    title: "Ecommerce",
    heading: "Connect what you posted to what you sold",
    lede: "For a store, the only question that matters is whether the marketing paid for itself. RocketEase answers it without double-counting to make itself look good.",
    problems: [
      { title: "Every platform claims the same sale", body: "Meta reports the conversion. Google reports the conversion. Your store reports one order. Add the dashboards together and you have sold it three times." },
      { title: "Organic and paid are reported apart", body: "Two tools, two definitions, two timezones — and no way to see what a campaign actually did across both." },
      { title: "Product content is a treadmill", body: "New drop, same fifteen assets, four networks, per-network specs, every week." },
    ],
    features: [
      { title: "Attribution that refuses to double-count", body: "A paid utm_medium belongs to the ad platform; everything else belongs to your tracking source. Site-reported and ad-reported conversions never both claim the same order.", detail: ["ROAS is paid-medium revenue divided by spend — one definition, stated on the page"] },
      { title: "Shopify and GA4", body: "Order and revenue events flow in directly. Or post your own events to a signed webhook if you would rather not add a vendor." },
      { title: "Organic and paid in one campaign", body: "The campaign record holds both. Spend, outcomes, content and conversations sit in the same place, on the same dates." },
      { title: "Content library with rights", body: "Assets carry rights and expiry, so a licensed image cannot be published after the licence ends. The product blocks it rather than trusting you to remember." },
      { title: "Per-network variants", body: "One product launch, adapted per channel, scheduled together, validated against each network's current requirements." },
      { title: "Honest gaps", body: "When a network stops reporting a metric, the report says unavailable and why. A zero would look like a bad week." },
    ],
    closing: "If a tool cannot tell you which half of your marketing worked, it is a publishing tool. This one is not only that.",
  },
  "multi-location": {
    slug: "multi-location",
    title: "Multi-location",
    heading: "One brand, many locations, without losing either",
    lede: "Corporate needs consistency. The location needs to sound like it is on the same street as its customers. The tool usually forces you to pick one.",
    problems: [
      { title: "Consistency or relevance", body: "Lock everything down and locations post nothing. Open it up and someone posts something the brand has to apologise for." },
      { title: "Reviews go unanswered", body: "Reviews arrive per location. Nobody at head office sees them, and the location manager does not have a login." },
      { title: "Nobody can compare locations", body: "Fifteen dashboards, fifteen exports, one spreadsheet, once a quarter." },
    ],
    features: [
      { title: "A workspace per location", body: "Each location is its own workspace with its own channels, calendar and inbox — inside one organization with one bill and one overview." },
      { title: "Brand hub sets the rules", body: "Identity, voice, approved messaging with dated offers and compliance rules live at the brand level. A location works within them rather than guessing at them." },
      { title: "Approvals where they matter", body: "Route location posts to a regional approver, or let a trusted location publish directly. Set per workspace, not globally." },
      { title: "Google Business Profile", body: "Reviews and posts per location, in the same inbox as everything else, so a review does not sit for a week." },
      { title: "Compare across locations", body: "The overview ranks every location on the same definitions, so a comparison is a screen rather than a quarterly exercise." },
      { title: "Roles that fit a franchise", body: "Eight workspace roles, so a franchisee sees their location, a regional manager sees their region, and neither sees the other's numbers." },
    ],
    closing: "The organization is the boundary. The workspace is the location. Everything else follows from getting that shape right.",
  },
};

export const SOLUTION_SLUGS = Object.keys(SOLUTIONS);
