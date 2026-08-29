import type { LegalDoc } from "./types";
import { CONTACT, LEGAL_EFFECTIVE, SITE } from "@/lib/site";

/**
 * Doubles as the "Data Deletion Instructions URL" that Meta, TikTok and other
 * providers require on a published app. Keep the steps here in step with the
 * platform's /api/connect/[provider]/data-deletion endpoint.
 */
export const DATA_DELETION: LegalDoc = {
  slug: "data-deletion",
  title: "Data deletion and your rights",
  heading: "Deleting your data, and exercising your rights",
  lede: "Exactly how to delete a channel, a workspace, or your whole account — what goes, what stays, and how long it takes.",
  updated: LEGAL_EFFECTIVE,
  sections: [
    {
      id: "disconnect-a-channel",
      heading: "Disconnect a social account",
      blocks: [
        "This is the fastest route, and it is the one to use if you want RocketEase to stop holding data from Instagram, Facebook, LinkedIn, TikTok or any other network.",
        {
          ordered: true,
          list: [
            `Sign in at [${SITE.appUrl}](${SITE.appUrl}).`,
            "Open **Connected accounts** in the workspace holding the channel.",
            "Find the channel, open its menu, and choose **Disconnect**.",
            "Read the impact summary — it lists scheduled posts and reports that will be affected — and confirm.",
          ],
        },
        "**What happens immediately:** we revoke the access token with the network where the network supports revocation, delete the stored token from our database, stop all polling and publishing for that channel, and cancel its queued jobs.",
        "**What happens within 30 days:** we delete the cached Platform Data for that channel — profile metadata, inbox conversations, insights and post records retrieved from the network.",
        {
          note: "You can also revoke RocketEase from the network's own settings — Facebook Settings → Apps and Websites, Instagram Settings → Website Permissions, LinkedIn Settings → Permitted Services, TikTok Settings → Security → Manage app permissions. When a network tells us access was revoked, we run the same deletion automatically, without you doing anything here.",
        },
      ],
    },
    {
      id: "delete-content",
      heading: "Delete specific content",
      blocks: [
        {
          list: [
            "**A post or draft** — open it and choose Delete. Assets it referenced stay in the library.",
            "**A media asset** — Content library, open the asset, Delete. Assets referenced by a scheduled post are protected until you release them.",
            "**A conversation** — Inbox, open the thread, Delete. This removes our copy; it does not delete the message on the network.",
            "**A workspace** — Settings → General → Delete workspace. This removes its channels, content, media, conversations and reports.",
          ],
        },
        "**Anything already published to a social network stays there.** Deleting in RocketEase never deletes the live post, comment or reply on Instagram, Facebook, LinkedIn or TikTok. Use the network to remove it. We say this at the point of deletion too, so nobody is surprised.",
      ],
    },
    {
      id: "delete-account",
      heading: "Delete your account and organization",
      blocks: [
        {
          ordered: true,
          list: [
            "Sign in and open **Settings → Data and privacy**.",
            "Export anything you want to keep first — content, media, reports and the audit log are all exportable.",
            "Choose **Delete organization**. Only an owner can do this.",
            "Confirm with your password and, if it is enabled, your second factor.",
          ],
        },
        "**Timeline:** access ends immediately. Provider tokens are deleted immediately. Your data remains exportable for 30 days, then is deleted or irreversibly de-identified from live systems within a further 30 days. Backups age out on a rolling 35-day cycle and are never restored to live systems to recover deleted data.",
        "**What we keep, and why:** billing and tax records for 7 years because the law requires it; append-only audit records for the life of the organization; and anything covered by a legal hold, kept confidential and used only for that purpose.",
      ],
    },
    {
      id: "request-by-email",
      heading: "Ask us to do it",
      blocks: [
        `If you cannot sign in, or you are not a RocketEase customer but believe we hold information about you, email [${CONTACT.privacy}](mailto:${CONTACT.privacy}) with what you want us to do and enough detail to find the records.`,
        "We answer within 30 days, or 45 where California law permits an extension and we tell you why. We may need to verify your identity, and we will ask for no more than is necessary to do it. An authorised agent may act for you with written permission.",
        "You can also ask us to **access, correct, port, or restrict** your information, to **object** to processing, or to **withdraw consent** — the same address handles all of it. We will not treat you differently for asking.",
      ],
    },
    {
      id: "not-a-customer",
      heading: "If you interacted with a business that uses RocketEase",
      blocks: [
        "If you commented on a post, sent a direct message, or left a review, and that business manages its social presence with RocketEase, we hold a copy of your message **on that business's behalf**. The business decides what happens to it — we cannot delete it on our own initiative without their instruction.",
        `Ask the business directly. If you cannot identify or reach them, email [${CONTACT.privacy}](mailto:${CONTACT.privacy}) with the network, the account, and roughly when you interacted, and we will identify the customer and pass your request to them.`,
        "Deleting your message on the network itself is usually faster, and when the network tells us it was deleted we remove our copy too.",
      ],
    },
    {
      id: "automated-deletion",
      heading: "Automated deletion requests from networks",
      blocks: [
        "Some networks let a person request deletion of their data from every connected app at once. We honour those requests automatically.",
        {
          list: [
            "**Meta** — when someone removes RocketEase from their Facebook or Instagram settings, Meta calls our deauthorization and data-deletion endpoints. We queue the deletion immediately and return a confirmation code and a status URL, where the requester can check progress at any time.",
            "**Other networks** — where a network offers an equivalent signal we handle it the same way; where it does not, disconnecting the channel in RocketEase achieves the same result.",
          ],
        },
        "These requests are processed by the same code path as a manual disconnect, so the outcome is identical: token revoked and deleted at once, cached Platform Data gone within 30 days.",
      ],
    },
  ],
};
