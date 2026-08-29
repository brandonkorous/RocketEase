import type { LegalDoc } from "./types";
import { CONTACT, LEGAL_EFFECTIVE, SITE } from "@/lib/site";

export const SUBSCRIPTION_TERMS: LegalDoc = {
  slug: "subscription-terms",
  title: "Subscription and refunds",
  heading: "Subscription, billing and refund terms",
  lede: "Trials, renewals, credits, price changes, cancellation and refunds — written so you can predict your bill.",
  updated: LEGAL_EFFECTIVE,
  sections: [
    {
      id: "plans",
      heading: "Plans and what you are charged",
      blocks: [
        "RocketEase is billed per workspace, monthly or yearly, on the plan you choose. Payments are processed by Stripe. We never see or store your card number.",
        {
          list: [
            "**Subscription fee** — charged in advance for the period, on the day you subscribe and on the same day each period after.",
            "**AI credits** — each plan includes an allowance of AI credits per billing period. Drafting and image generation consume credits at the rates shown in the product before you run them.",
            "**Overage** — if you exceed the included allowance, additional credits are metered and billed in arrears on your next invoice. **Your usage ledger shows every generation and its cost as it happens**, so overage is never a surprise at the end of a period.",
            "**Ad spend is not billed by us.** Money you spend on advertising goes to the network directly, on your own payment method there.",
          ],
        },
        "Fees exclude sales tax, VAT and similar taxes, which are added where applicable. Give us a valid exemption certificate and we will stop charging them.",
      ],
    },
    {
      id: "trial",
      heading: "Free trial",
      blocks: [
        "New organizations get a 14-day free trial. No card is required to start it.",
        "**If you have not added a payment method by the end of the trial, the account simply pauses — we do not charge you.** If you have added one, the subscription begins at the end of the trial at the plan you selected, and we email you before that happens.",
        "One trial per organization. We may decline a trial to an organization that has had one.",
      ],
    },
    {
      id: "renewal",
      heading: "Automatic renewal",
      blocks: [
        "**Your subscription renews automatically at the end of each period until you cancel.** We say so at checkout, before you pay, and we send an acknowledgement afterwards that repeats the terms and tells you how to cancel.",
        {
          list: [
            "**Monthly plans** renew every month on the anniversary of your first payment.",
            "**Yearly plans** renew every year, and **we email a reminder at least 30 days before** each renewal, stating the date and the amount.",
            "**Price increases** take effect only at a renewal, and **we give at least 30 days' notice** before the increase applies. If you do not want to pay the new price, cancel before the renewal date.",
          ],
        },
      ],
    },
    {
      id: "cancel",
      heading: "Cancelling",
      blocks: [
        `**You can cancel online, in one place, at any time.** Sign in at [${SITE.appUrl}](${SITE.appUrl}), open **Settings → Billing**, and choose **Cancel subscription**. No phone call, no email, no retention conversation you have to sit through.`,
        {
          list: [
            "Cancellation takes effect at the end of the period you have already paid for. You keep full access until then.",
            "After that the workspace becomes read-only, and your data stays exportable for 30 days.",
            "We do not pro-rate a partial month or year on cancellation — see refunds below.",
          ],
        },
      ],
    },
    {
      id: "refunds",
      heading: "Refunds",
      blocks: [
        {
          list: [
            "**14-day money back.** If you are unhappy in the first 14 days of your first paid period, tell us and we will refund it in full. No conditions.",
            "**Yearly plans.** Cancel within 30 days of a yearly payment and we refund it in full, less any AI overage already incurred. After 30 days a yearly term is not refundable, but you keep access for the rest of it.",
            "**We got it wrong.** If we billed you in error, charged the wrong plan, or a sustained outage prevented you from using what you paid for, we refund the affected period. Tell us and we will fix it.",
            "**AI credits** are consumed when a generation runs and are not refundable once used. Unused included credits do not roll over.",
            "**Termination for breach.** If we terminate your account for a breach of the [Acceptable Use Policy](/acceptable-use), no refund is due.",
          ],
        },
        `Refunds go back to the original payment method within 10 business days. Ask at [${CONTACT.support}](mailto:${CONTACT.support}).`,
      ],
    },
    {
      id: "non-payment",
      heading: "Failed payments",
      blocks: [
        "If a payment fails we retry over 15 days and email you each time. During that period nothing changes for you.",
        "After 15 days we suspend the workspace: it becomes read-only, scheduled posts stop publishing, and inbox polling stops. Nothing is deleted. Pay the outstanding balance and everything resumes.",
        "If an account stays suspended for 60 days we may terminate it under the [Terms of Service](/terms), after a final notice.",
      ],
    },
    {
      id: "agencies",
      heading: "Agencies",
      blocks: [
        "If you are an agency, the organization that holds the subscription is the customer of record and is responsible for the fees, regardless of any arrangement you have with your clients. Client margin and rebilling tools inside RocketEase are for your own reporting; we do not bill your clients and are not party to your agreements with them.",
      ],
    },
    {
      id: "california",
      heading: "California customers",
      blocks: [
        "These terms are written to meet California's Automatic Renewal Law: a clear pre-billing disclosure of the recurring charge and its frequency, your affirmative consent before we charge, an emailed acknowledgement with the cancellation method, a cancellation control online in the same place you signed up, an annual renewal reminder, and advance notice before any price increase.",
        `If you believe we have fallen short of any of that, tell us at [${CONTACT.support}](mailto:${CONTACT.support}) and we will make it right.`,
      ],
    },
  ],
};
