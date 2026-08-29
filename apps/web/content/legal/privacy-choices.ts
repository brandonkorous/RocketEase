import type { LegalDoc } from "./types";
import { CONTACT, LEGAL_EFFECTIVE, SITE } from "@/lib/site";

export const PRIVACY_CHOICES: LegalDoc = {
  slug: "privacy-choices",
  title: "Your privacy choices",
  heading: "Your privacy choices",
  lede: "The opt-outs available to you, and an honest account of which ones you will not need here.",
  updated: LEGAL_EFFECTIVE,
  sections: [
    {
      id: "sale-and-sharing",
      heading: "Selling and sharing",
      blocks: [
        {
          note: "**RocketEase does not sell personal information, and does not share it for cross-context behavioural advertising** — as those terms are defined in the California Consumer Privacy Act and the comparable laws of Virginia, Colorado, Connecticut, Texas, Oregon, Montana and other states. We have never done either. **There is therefore no opt-out for you to submit**, and this page exists to say so plainly rather than to make you hunt for a control that does nothing.",
        },
        "We run no advertising pixels and no third-party trackers on this site or in the product. See our [cookie policy](/cookies) for the complete list of what we set, which is four strictly necessary cookies.",
        "If this ever changes, we will publish a working opt-out here and give notice before the change takes effect.",
      ],
    },
    {
      id: "gpc",
      heading: "Global Privacy Control",
      blocks: [
        "We honour the **Global Privacy Control** signal. If your browser or extension sends GPC, we treat it as a valid opt-out request from your browser, and as a request to limit the use of sensitive personal information, without asking you to do anything else.",
        "Because we do not sell or share, GPC changes nothing about how we handle your data — but we recognise and respect the signal, and we do not require you to create an account to send it.",
      ],
    },
    {
      id: "sensitive",
      heading: "Limiting sensitive personal information",
      blocks: [
        "The only information we hold that California classifies as sensitive is your account credentials and your two-factor secret. **We use them solely to authenticate you** — never to infer characteristics about you, and never for any secondary purpose.",
        "Because that use falls within the exemptions in the CCPA regulations, the right to limit does not give you anything further to restrict. If you would rather we did not hold a two-factor secret, you can turn two-factor authentication off in Settings, though we would encourage you to keep it.",
      ],
    },
    {
      id: "marketing",
      heading: "Marketing email",
      blocks: [
        {
          list: [
            "**Unsubscribe** from any marketing email using the link in its footer. It takes effect immediately.",
            `**Or email** [${CONTACT.privacy}](mailto:${CONTACT.privacy}) and ask us to stop.`,
            "**Product notifications** — publishing failures, approval requests, connection problems, invoices — are part of the service, not marketing. Tune them in **Settings → Notifications** rather than unsubscribing, so you do not miss a failed post.",
          ],
        },
      ],
    },
    {
      id: "in-product",
      heading: "Controls inside the product",
      blocks: [
        `Sign in at [${SITE.appUrl}](${SITE.appUrl}) to reach these directly:`,
        {
          list: [
            "**Settings → Data and privacy** — export your data, delete a workspace, or delete the whole organization.",
            "**Settings → Security** — active sessions with device and IP, revoke any of them, manage two-factor authentication and backup codes.",
            "**Settings → Notifications** — choose what we email you about.",
            "**Connected accounts** — see exactly which permissions each channel holds, and disconnect any of them.",
            "**Settings → Audit log** — see every sensitive action taken in your organization, by whom and when.",
          ],
        },
      ],
    },
    {
      id: "other-rights",
      heading: "Your other rights",
      blocks: [
        "Access, correction, deletion, portability, restriction, objection and withdrawal of consent are all covered — with the steps and timelines — on [Data deletion and your rights](/data-deletion).",
        `Everything else: [${CONTACT.privacy}](mailto:${CONTACT.privacy}). We answer within 30 days, and we will not treat you differently for asking.`,
      ],
    },
  ],
};
