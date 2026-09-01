import type { LegalDoc } from "./types";
import { CONTACT, LEGAL_EFFECTIVE } from "@/lib/site";

export const SUBPROCESSORS: LegalDoc = {
  slug: "subprocessors",
  title: "Subprocessors",
  heading: "Subprocessors",
  lede: "Every third party that may process personal information on our behalf when we deliver RocketEase, what it does, and where it does it.",
  updated: LEGAL_EFFECTIVE,
  sections: [
    {
      id: "how-this-works",
      heading: "How this list works",
      blocks: [
        "A subprocessor is a company we engage to help deliver RocketEase that may handle personal information from your workspace. Our [Data Processing Addendum](/dpa) is your general authorisation for us to use the subprocessors on this list.",
        "**We give at least 30 days' notice before a new subprocessor starts handling customer data.** Subscribe to changes by emailing [" + CONTACT.privacy + "](mailto:" + CONTACT.privacy + ") with the subject \"subprocessor notifications\", and we will add you to the notice list.",
        "If you reasonably object to a new subprocessor on data-protection grounds, tell us within those 30 days. We will work with you to find an alternative. If we cannot, you may terminate the affected part of the service and we will refund the unused portion of your fees.",
        "Every subprocessor is bound by a written contract imposing data-protection obligations no less protective than those in our DPA.",
      ],
    },
    {
      id: "infrastructure",
      heading: "Infrastructure",
      blocks: [
        {
          table: {
            head: ["Subprocessor", "Purpose", "Data", "Location"],
            rows: [
              ["Microsoft Azure (Microsoft Corporation)", "Application hosting (AKS), managed PostgreSQL, Blob Storage for media, Key Vault for encryption keys", "All customer data", "United States"],
              ["Cloudflare, Inc.", "DNS, TLS termination at the edge, DDoS protection", "IP addresses and request metadata in transit", "Global edge network"],
            ],
          },
        },
        "Our database has no public network access. Application code connects as a restricted role, and schema migrations run as an in-cluster job — never from a workstation or a CI runner.",
      ],
    },
    {
      id: "product",
      heading: "Product features",
      blocks: [
        {
          table: {
            head: ["Subprocessor", "Purpose", "Data", "Location"],
            rows: [
              ["Microsoft Corporation (Azure OpenAI Service)", "Generating post copy and captions when you use AI drafting", "Your prompt and the brand information you have entered", "United States — inference is pinned to the US data zone"],
              ["Microsoft Corporation (Azure OpenAI Service)", "Generating images when you use AI image generation", "Your image prompt and your brand kit's visual direction — palette and style notes — which we append to it", "Stored in the United States; **generation may be processed in any region where the model runs**"],
              ["Stripe, Inc.", "Subscription billing, payment processing, usage metering, invoices", "Billing contact, plan, subscription and payment status. **Stripe is a controller for payment card data; we never receive your card number**", "United States"],
              ["Google LLC", "\"Sign in with Google\", where you choose it", "Email address, name and profile picture from your Google account", "United States"],
              ["Apple Inc.", "\"Sign in with Apple\", where you choose it", "Email address (or private relay address) and name", "United States"],
            ],
          },
        },
        "**AI drafting and image generation both run inside our own Azure tenancy**, on a resource we control, under the same Microsoft agreement that covers our hosting and databases. Your prompt is not sent to OpenAI. The two differ in one way worth stating: drafting is a US data-zone deployment, while the image models we use are offered only as a *global* deployment — so image generation itself may run in any region where Microsoft hosts that model. Anything Microsoft stores stays in the United States.",
        "**Your prompts and outputs are not used to train anyone's models.** Microsoft states that prompts and completions are not available to OpenAI or other model providers, are not used to improve their models or services, and are not used to train foundation models ([Azure data, privacy and security](https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/data-privacy)).",
        "**Post copy runs in the same Azure tenancy, on our own resource, and stays in the United States.** Drafting uses a US data-zone deployment, so unlike image generation the prompt itself does not leave the country. No third-party model provider receives it.",
        "**Microsoft screens for abuse.** If automated systems flag a prompt as potentially violating Microsoft's code of conduct, a sample may be retained and reviewed by authorised Microsoft staff. That is Microsoft's safety process, not ours, and we do not receive the results.",
      ],
    },
    {
      id: "operations",
      heading: "Operations",
      blocks: [
        {
          table: {
            head: ["Subprocessor", "Purpose", "Data", "Location"],
            rows: [
              ["Transactional email provider (SMTP relay)", "Delivering verification, password reset, invitation, notification and report emails", "Recipient email address, name, and the message body we generate", "United States"],
            ],
          },
        },
        "Application logging, tracing and error monitoring run on our own OpenTelemetry pipeline inside our Azure tenancy. No third-party monitoring service receives your data.",
      ],
    },
    {
      id: "not-subprocessors",
      heading: "What is not on this list",
      blocks: [
        {
          list: [
            "**Social networks you connect** — Meta, LinkedIn, TikTok and others. When we publish or read on your behalf we act on your instruction, and each network is an independent controller of the data it holds. Their handling is governed by their own terms, which you accept when you connect.",
            "**Analytics and commerce systems you connect** — Google Analytics 4, Shopify, or your own webhook source. These are your systems, integrated at your direction.",
            "**Malware scanning**, which runs on our own infrastructure. Uploaded media is not sent to a third party to be scanned.",
          ],
        },
      ],
    },
  ],
};
