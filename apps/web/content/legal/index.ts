import type { LegalDoc } from "./types";
import { PRIVACY } from "./privacy";
import { TERMS } from "./terms";
import { ACCEPTABLE_USE } from "./acceptable-use";
import { DPA } from "./dpa";
import { SUBPROCESSORS } from "./subprocessors";
import { COPYRIGHT } from "./copyright";
import { COOKIES } from "./cookies";
import { DATA_DELETION } from "./data-deletion";
import { SECURITY } from "./security";
import { SUBSCRIPTION_TERMS } from "./subscription-terms";
import { ACCESSIBILITY } from "./accessibility";
import { PRIVACY_CHOICES } from "./privacy-choices";

export const LEGAL_DOCS: LegalDoc[] = [
  PRIVACY,
  TERMS,
  ACCEPTABLE_USE,
  DPA,
  SUBPROCESSORS,
  COPYRIGHT,
  COOKIES,
  DATA_DELETION,
  SECURITY,
  SUBSCRIPTION_TERMS,
  ACCESSIBILITY,
  PRIVACY_CHOICES,
];

/** One-line purpose for each document, used on the /legal index. */
export const LEGAL_SUMMARY: Record<string, string> = {
  privacy: "What personal information we handle, why, and the choices you have.",
  terms: "The contract between you and us.",
  "acceptable-use": "What you may not do with RocketEase, and what happens if you do.",
  dpa: "Our commitments when we process personal data on your behalf.",
  subprocessors: "Every third party that may touch your data, and where.",
  copyright: "How to send a DMCA notice, and how we respond.",
  cookies: "The four cookies we set. There are no tracking cookies.",
  "data-deletion": "Delete a channel, a workspace, or your whole account.",
  security: "How we protect your data — including what we have not done yet.",
  "subscription-terms": "Trials, renewals, credits, cancellation and refunds.",
  accessibility: "Our WCAG 2.2 AA target, and the gaps we know about.",
  "privacy-choices": "Opt-outs, Global Privacy Control, and marketing email.",
};

export { PRIVACY, TERMS, ACCEPTABLE_USE, DPA, SUBPROCESSORS, COPYRIGHT };
export { COOKIES, DATA_DELETION, SECURITY, SUBSCRIPTION_TERMS, ACCESSIBILITY, PRIVACY_CHOICES };
