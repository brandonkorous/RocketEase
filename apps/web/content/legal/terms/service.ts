import type { LegalSection } from "../types";
import { CONTACT, ENTITY } from "@/lib/site";

export const SERVICE_SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    heading: "This agreement",
    blocks: [
      `These Terms of Service are an agreement between you and ${ENTITY.legalName}, a ${ENTITY.formationState} limited liability company that operates ${ENTITY.productName}. They apply when you create an account, use the service, or accept an invitation to a workspace.`,
      "The following documents form part of this agreement: our [Acceptable Use Policy](/acceptable-use), our [Data Processing Addendum](/dpa), our [Subscription and refund terms](/subscription-terms), and our [Copyright policy](/copyright). Where they conflict with these terms, the more specific document controls for its subject matter.",
      "If you are agreeing on behalf of a company, you confirm you are authorized to bind it, and \"you\" means that company. If you do not agree, do not use the service.",
    ],
  },
  {
    id: "accounts",
    heading: "Accounts, organizations and workspaces",
    blocks: [
      {
        list: [
          "An **organization** is the billing and contract boundary. A **workspace** is a brand or client inside it. A **channel** is a connected profile, page or ad account.",
          "The person who creates an organization is its owner and is responsible for it. Owners and administrators may add and remove members, change roles, and access anything in their workspaces.",
          "You are responsible for everything done under your account. Keep your credentials secret, enable two-factor authentication, and tell us at once if you suspect misuse.",
          "**Agencies.** If an agency administers a workspace on your behalf, the agency acts as your agent. Instructions the agency gives us are treated as yours. If your relationship ends, the organization owner controls what happens to the workspace.",
          "You must be at least 16 years old and legally able to enter into a contract.",
        ],
      },
    ],
  },
  {
    id: "service",
    heading: "The service, and changes to it",
    blocks: [
      "We provide the service described on our site and in the product, on the plan you have bought. We improve it continuously, so features change. We will not materially degrade a feature you are paying for without telling you at least 30 days beforehand.",
      "Features labelled beta, preview or early access are provided as they are, may change or be withdrawn, and are excluded from any service commitment.",
      "The service depends on third-party networks. What you can publish, read, or measure is set by each network's API and by the permissions you grant. Those limits change without our involvement, and we describe current capability honestly in the product rather than promising more.",
    ],
  },
  {
    id: "your-content",
    heading: "Your content",
    blocks: [
      "**You own your content.** Posts, media, brand information, audience data, conversations and reports you bring into or create in RocketEase remain yours. We claim no ownership.",
      "You grant us a worldwide, non-exclusive, royalty-free licence to host, store, copy, transmit, reformat, create technical renditions of, display and publish your content, **solely to operate the service for you** — for example to make a thumbnail, to resize an image for a network's requirements, or to deliver a post you scheduled. The licence lasts only as long as we hold the content, and ends when you delete it or close your account.",
      "You represent that you have the rights to the content you upload and publish, including rights in any music, footage, likeness, trademark or third-party material it contains, and that publishing it will not break the law or a contract you are bound by.",
      { note: "We do not use your content to train machine-learning models, and we do not license it to anyone who does." },
    ],
  },
  {
    id: "acceptable-use",
    heading: "Acceptable use",
    blocks: [
      "Your use of RocketEase must comply with our [Acceptable Use Policy](/acceptable-use), which is part of this agreement. It prohibits, among other things, infringing content, harassment, spam, malware, scraping, and circumventing the rate limits or terms of any connected network.",
      "We may remove content or suspend access if we reasonably believe it breaches that policy, exposes us or a connected network to legal risk, or threatens the security of the service. Where it is safe and lawful to do so, we will tell you first and give you a chance to fix it.",
    ],
  },
  {
    id: "networks",
    heading: "Connected networks",
    blocks: [
      {
        list: [
          "When you connect a channel you also agree to that network's own terms and developer policies, and you must keep to them. A conflict between a network's terms and ours, as to that network, is resolved in the network's favour.",
          "We act on your instruction when we publish, reply or read on your behalf. **We do not control the networks.** They may reject a post, remove content, throttle an account, revoke a permission, change an API, or suspend you, for reasons of their own and without notice to us.",
          "We are not liable for a network's acts or omissions, for content a network refuses or removes, or for metrics a network reports inaccurately or stops reporting.",
          "Content we publish for you lives on the network. Deleting it in RocketEase does not delete it there.",
        ],
      },
    ],
  },
  {
    id: "ai",
    heading: "AI features",
    blocks: [
      "RocketEase can draft copy and generate images from prompts and from the brand information you enter.",
      {
        list: [
          "As between you and us, **you own the output** you generate, and you may use it commercially. Identical or similar output may be generated for other customers, so we cannot promise it is unique or protectable.",
          "**Output may be inaccurate, biased, or resemble existing work.** You are responsible for reviewing it before publishing, and for the consequences of publishing it. Do not rely on it for legal, medical, financial or safety-critical claims.",
          "You must not present AI-generated content in a way that breaks a connected network's synthetic-media disclosure rules, or any law requiring you to label AI-generated material.",
          "Generation consumes credits, metered as described in our [Subscription and refund terms](/subscription-terms).",
        ],
      },
    ],
  },
  {
    id: "fees",
    heading: "Fees",
    blocks: [
      `Plans, trials, renewals, credits, overages, price changes, cancellation and refunds are governed by our [Subscription and refund terms](/subscription-terms). Payments are processed by Stripe; we never hold your card number. Fees exclude taxes, which you owe unless you give us a valid exemption certificate. Questions go to [${CONTACT.support}](mailto:${CONTACT.support}).`,
    ],
  },
];
