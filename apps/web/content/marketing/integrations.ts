import type { Platform } from "@rocketease/ui/icons";

export type IntegrationStatus = "review" | "built" | "planned";

export type Integration = {
  platform: Platform;
  name: string;
  status: IntegrationStatus;
  what: string;
  capabilities: string[];
};

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  review: "In provider review",
  built: "Built, awaiting review",
  planned: "Planned",
};

export const STATUS_NOTE: Record<IntegrationStatus, string> = {
  review: "The adapter is written and the developer app is submitted. Availability depends on the network approving it.",
  built: "The adapter is written and tested against our own contract suite, but the developer app has not been submitted yet.",
  planned: "Scoped, not built. Sequenced behind the networks above.",
};

/*
 * Status reflects what is actually true in the repo and with each provider.
 * Never promote a row to a stronger status than the connector has earned.
 */
export const INTEGRATIONS: Integration[] = [
  {
    platform: "instagram",
    name: "Instagram",
    status: "review",
    what: "Business and creator accounts, through the Meta Graph API.",
    capabilities: ["Publish image, carousel, video, reel and story", "Comments and mentions", "Direct messages", "Organic insights", "Webhooks"],
  },
  {
    platform: "facebook",
    name: "Facebook Pages",
    status: "review",
    what: "Pages you manage, through the Meta Graph API.",
    capabilities: ["Publish text, image, carousel, video and reel", "Comments and reviews", "Messenger", "Organic insights", "Ad performance (read-only)", "Webhooks"],
  },
  {
    platform: "linkedin",
    name: "LinkedIn",
    status: "review",
    what: "Organization pages and member accounts, through the Posts API.",
    capabilities: ["Publish text, image, multi-image, video and article", "Comments", "Organic insights"],
  },
  {
    platform: "tiktok",
    name: "TikTok",
    status: "review",
    what: "Direct posting through the Content Posting API.",
    capabilities: ["Publish video and photo", "Comments", "Organic insights"],
  },
  {
    platform: "youtube",
    name: "YouTube",
    status: "built",
    what: "Channel uploads and community engagement.",
    capabilities: ["Publish video and short", "Comments", "Channel insights"],
  },
  {
    platform: "pinterest",
    name: "Pinterest",
    status: "built",
    what: "Boards and pins.",
    capabilities: ["Publish pin and idea pin", "Comments", "Pin insights"],
  },
  {
    platform: "x",
    name: "X",
    status: "built",
    what: "Posting and replies, subject to the API tier we hold.",
    capabilities: ["Publish text, image and video", "Replies and mentions"],
  },
];

export const DATA_SOURCES = [
  { name: "Google Analytics 4", what: "Site-reported conversions and revenue, attributed to your marketing.", status: "built" as const },
  { name: "Shopify", what: "Order and revenue events for ecommerce attribution.", status: "built" as const },
  { name: "Signed webhook", what: "Your own system posts conversion events to a signed endpoint. No vendor required.", status: "built" as const },
  { name: "Google Business Profile", what: "Reviews and posts for multi-location businesses.", status: "built" as const },
];

export const CAPABILITY_NOTE = [
  "We model capability **per connected channel**, not as a marketing-wide yes or no. Two Instagram accounts can support different things depending on the permissions each one granted and how the network classifies it.",
  "Every capability carries a reason and a last-checked time, and the composer's validation derives from that model rather than from a hardcoded list. When a network changes an API, the product tells you what changed instead of failing at publish time.",
];
