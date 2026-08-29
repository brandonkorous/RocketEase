import type { LegalDoc } from "./types";
import { CONTACT, LEGAL_EFFECTIVE } from "@/lib/site";

export const COOKIES: LegalDoc = {
  slug: "cookies",
  title: "Cookie policy",
  heading: "Cookies and similar technologies",
  lede: "What we store on your device, why, and how to control it. The short version: we use cookies to keep you signed in, and nothing else.",
  updated: LEGAL_EFFECTIVE,
  sections: [
    {
      id: "summary",
      heading: "Summary",
      blocks: [
        {
          note: "**RocketEase sets no advertising cookies and no third-party tracking cookies, on the marketing site or in the product.** We do not run advertising pixels, and we do not build profiles of visitors. There is therefore no consent banner to click through.",
        },
        "Because we set only strictly necessary cookies, the consent requirement in the EU ePrivacy Directive and the UK PECR does not apply. If that changes we will ask for your consent before setting anything else, and this page will say so.",
      ],
    },
    {
      id: "what-we-set",
      heading: "What we set",
      blocks: [
        {
          table: {
            head: ["Name", "Purpose", "Type", "Expires"],
            rows: [
              ["Session cookie", "Keeps you signed in to the product and identifies your session so you can list and revoke it", "Strictly necessary; HTTP-only, Secure, SameSite=Lax", "On sign-out, or 30 days"],
              ["OAuth state", "Single-use value that ties a channel connection you started to the response the network sends back, preventing cross-site request forgery", "Strictly necessary", "Minutes; deleted on use"],
              ["Theme and layout preferences", "Remembers interface choices you made", "Strictly necessary (functional)", "12 months"],
              ["Load balancer affinity", "Routes your requests consistently during a session", "Strictly necessary", "Session"],
            ],
          },
        },
        "The marketing site sets no cookies until you sign in or start a channel connection.",
      ],
    },
    {
      id: "other-technologies",
      heading: "Other storage",
      blocks: [
        "The product uses your browser's local storage for interface state — the last workspace you were in, a draft you have not saved, a collapsed panel. This stays on your device, is not sent to us, and is cleared when you clear site data.",
        "We use no web beacons, no fingerprinting, and no session-replay tooling.",
      ],
    },
    {
      id: "third-parties",
      heading: "Third parties",
      blocks: [
        {
          list: [
            "**Stripe** may set cookies on its own checkout and billing-portal pages, which are hosted by Stripe, for fraud prevention. Those pages are governed by Stripe's policies.",
            "**Google and Apple** set cookies during their sign-in flows if you choose those options, on their own domains.",
            "**Social networks** set cookies on their own domains during a channel connection, on the network's authorisation screen.",
          ],
        },
        "We embed no social media widgets, share buttons or video players that would set third-party cookies on our pages.",
      ],
    },
    {
      id: "control",
      heading: "Controlling cookies",
      blocks: [
        "Every browser lets you see, block and delete cookies in its settings. Blocking strictly necessary cookies will stop you signing in, and channel connections will fail — there is no way around that, because those cookies are how the security of those flows works.",
        `Questions: [${CONTACT.privacy}](mailto:${CONTACT.privacy}). See also our [Privacy policy](/privacy) and [Your privacy choices](/privacy-choices).`,
      ],
    },
  ],
};
