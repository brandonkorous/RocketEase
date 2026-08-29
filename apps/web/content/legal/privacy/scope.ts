import type { LegalSection } from "../types";
import { CONTACT, ENTITY, formattedAddress } from "@/lib/site";

export const SCOPE_SECTIONS: LegalSection[] = [
  {
    id: "who-we-are",
    heading: "Who we are",
    blocks: [
      `${ENTITY.productName} is a social marketing platform operated by ${ENTITY.legalName}, a ${ENTITY.formationState} limited liability company. In this policy "we", "us" and "${ENTITY.shortName}" mean ${ENTITY.legalName}.`,
      `You can reach us at [${CONTACT.privacy}](mailto:${CONTACT.privacy}) or by post at ${formattedAddress()}.`,
      "This policy explains what personal information we handle, why, who we share it with, how long we keep it, and the choices you have.",
    ],
  },
  {
    id: "two-roles",
    heading: "The two roles we play",
    blocks: [
      "RocketEase handles personal information in two distinct capacities, and the rules differ between them. Read this section first — it determines which parts of this policy apply to you.",
      {
        list: [
          "**As a controller.** For information about the people who visit rocketease.com, sign up for an account, administer a workspace, or contact us, we decide why and how the information is processed. Sections 3 through 12 of this policy describe that processing.",
          "**As a processor (service provider).** For the content, media, audience data and social conversations that a customer brings into their workspace, our customer decides why and how it is processed. We act on that customer's documented instructions. Our obligations are set out in our [Data Processing Addendum](/dpa), which forms part of our [Terms of Service](/terms).",
        ],
      },
      {
        note: "If you commented on, messaged, or otherwise interacted with a business that uses RocketEase, and your message reached that business through our Inbox, the business is the controller of that information — not us. Send your privacy request to that business. If you cannot identify or reach them, contact us and we will route your request to the relevant customer.",
      },
    ],
  },
  {
    id: "sources",
    heading: "Where information comes from",
    blocks: [
      {
        list: [
          "**Directly from you** — when you create an account, complete onboarding, enter brand information, upload media, write posts, invite teammates, or contact support.",
          "**From your social accounts** — when you connect a channel, the network sends us profile and page identifiers, access tokens, publishing capabilities, published-post metadata, insights, and inbound comments and messages. We only receive what the permissions you granted allow.",
          "**From your analytics and commerce systems** — if you connect Google Analytics 4, Shopify, or a signed webhook source, we receive conversion and revenue events attributed to your marketing.",
          "**Automatically** — server logs, request identifiers, device and browser information, and product telemetry described in section 5.",
          "**From our service providers** — for example, Stripe tells us the status of your subscription and payments. We never receive your full card number.",
        ],
      },
    ],
  },
];
