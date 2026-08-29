import type { LegalDoc } from "./types";
import { CONTACT, LEGAL_EFFECTIVE } from "@/lib/site";

export const ACCEPTABLE_USE: LegalDoc = {
  slug: "acceptable-use",
  title: "Acceptable use policy",
  heading: "Acceptable use policy",
  lede: "What you may not do with RocketEase, what you may not upload or publish through it, and what happens when someone does.",
  updated: LEGAL_EFFECTIVE,
  sections: [
    {
      id: "scope",
      heading: "Scope",
      blocks: [
        "This policy is part of the [Terms of Service](/terms). It applies to everyone who uses RocketEase, to everything you upload to it, and to everything you publish, send or schedule through it.",
        "It exists for three reasons: to keep the service safe, to keep us within the rules of the networks we connect to, and to keep RocketEase eligible for the legal protections that let us host content on your behalf.",
        {
          note: "Breaching this policy is the one thing that lets us suspend or terminate an account immediately, without the 30-day cure period the Terms otherwise give you.",
        },
      ],
    },
    {
      id: "content",
      heading: "Content you must not upload or publish",
      blocks: [
        "Do not use RocketEase to store, transmit, schedule or publish content that:",
        {
          list: [
            "**Infringes intellectual property.** Someone else's photographs, video, music, fonts, artwork, copy, trademarks or logos, used without a licence or another legal right. Music in short-form video is the most common way customers get this wrong — a network's in-app audio library licence does not travel to content published through a third-party tool.",
            "**Uses someone's likeness, name or voice without permission**, including synthetic or AI-generated depictions of a real person.",
            "**Is sexually explicit**, or sexualises a minor in any way. Child sexual abuse material is reported to the National Center for Missing & Exploited Children and to law enforcement, and the account is terminated without notice.",
            "**Harasses, threatens, defames or incites violence** against a person or group, or promotes a violent extremist or terrorist organisation.",
            "**Attacks people for who they are** — race, ethnicity, national origin, religion, disability, disease, age, sex, gender identity, sexual orientation, or immigration status.",
            "**Deceives.** Fabricated news, forged documents, impersonation of a person, brand or public body, fake reviews or testimonials, manipulated media presented as real, or claims you cannot substantiate.",
            "**Breaks advertising or consumer-protection law**, including undisclosed paid partnerships, unsubstantiated health, financial or earnings claims, and failure to label AI-generated material where a network or a law requires it.",
            "**Promotes prohibited goods or activity** — illegal drugs, weapons, counterfeit goods, human trafficking, illegal gambling, or the sale of regulated products to people who may not buy them.",
            "**Contains malware**, phishing, cryptojacking, or links to any of these.",
            "**Discloses another person's private information** — home address, government identifier, financial account, medical record, or private communications — without their consent.",
          ],
        },
      ],
    },
    {
      id: "conduct",
      heading: "Things you must not do to the service",
      blocks: [
        {
          list: [
            "Probe, scan, or test the vulnerability of the service, or breach its authentication or tenancy boundaries, except under a security disclosure we have agreed to in writing. See our [security page](/security).",
            "Access another customer's organization, workspace, content or data.",
            "Reverse engineer, decompile, or attempt to derive source code, except where the law expressly permits it.",
            "Resell, sublicense, or provide the service to a third party except as an agency administering that party's workspace under the Terms.",
            "Circumvent rate limits, quotas, credit metering, or plan entitlements; or run automated load beyond what the product's own interfaces perform.",
            "Use the service to build a competing product, or to benchmark it for publication without our written consent.",
            "Interfere with anyone else's use of the service, or attempt to degrade its availability.",
            "Remove or obscure proprietary notices.",
          ],
        },
      ],
    },
    {
      id: "networks",
      heading: "Things you must not do to connected networks",
      blocks: [
        "Every network you connect has its own terms, and you agreed to them. In particular, do not use RocketEase to:",
        {
          list: [
            "**Spam.** Bulk unsolicited messages, repetitive comments, mass mentions, follow/unfollow churn, or engagement pods.",
            "**Operate fake or bulk accounts**, buy followers or engagement, or coordinate inauthentic behaviour.",
            "**Scrape** a network beyond what its API returns for the permissions you granted, or store network data for a purpose the network prohibits.",
            "Publish to an account you do not own or are not authorised to manage.",
            "Evade a network's enforcement action, rate limits, or a suspension.",
            "Use Platform Data received through RocketEase for advertising targeting, profiling, resale, or machine-learning training.",
          ],
        },
        "A network's terms and ours both apply. Where they conflict as to that network, the network's terms win.",
      ],
    },
    {
      id: "ai",
      heading: "AI features",
      blocks: [
        {
          list: [
            "Do not use generation to produce content prohibited anywhere in this policy — the prohibition applies to the output regardless of how it was made.",
            "Do not generate depictions of real people in a false light, or synthetic audio or video of a real person, without their consent.",
            "Review generated output before it is published. You are responsible for it.",
            "Label AI-generated material where a connected network's synthetic-media policy or an applicable law requires it. Several networks require this and enforce it against the publishing account, which is yours.",
          ],
        },
      ],
    },
    {
      id: "reporting",
      heading: "Reporting a violation",
      blocks: [
        `Report abuse to [${CONTACT.support}](mailto:${CONTACT.support}). Tell us what you saw, where, and when. If the report concerns copyright, use the notice procedure in our [Copyright policy](/copyright) instead — it has specific legal requirements.`,
        "We do not pre-screen content. We review what is reported to us, and what our own automated scanning flags.",
      ],
    },
    {
      id: "enforcement",
      heading: "How we enforce",
      blocks: [
        "Our response is proportionate to the harm, and generally follows this order:",
        {
          ordered: true,
          list: [
            "We contact the account owner and ask them to fix it.",
            "We remove or disable access to the specific content.",
            "We suspend the affected channel, workspace, or account.",
            "We terminate the account and, where the law requires it, report the matter.",
          ],
        },
        "We skip straight to suspension or termination where there is an immediate risk of harm, a legal obligation, a demand from a connected network, or content of the kind that must be reported to authorities. We will tell you what we did and why, unless telling you is unlawful or would frustrate an investigation.",
        "Suspension for a breach of this policy does not entitle you to a refund.",
      ],
    },
  ],
};
