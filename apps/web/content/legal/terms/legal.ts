import type { LegalSection } from "../types";
import { CONTACT, ENTITY, formattedAddress } from "@/lib/site";

export const LEGAL_SECTIONS: LegalSection[] = [
  {
    id: "data-protection",
    heading: "Data protection",
    blocks: [
      "For personal information you bring into a workspace we act as your processor, and our [Data Processing Addendum](/dpa) applies automatically — you do not need to sign it separately. It lists our subprocessors, our security measures, our breach-notification commitment, and the Standard Contractual Clauses for international transfers.",
      "Our [Privacy policy](/privacy) describes the information we handle as a controller, which is mostly account and billing information.",
      "You are responsible for having a lawful basis for the personal information you put into RocketEase, for telling the people concerned what you do with it, and for honouring their requests. We will help you do so as the DPA describes.",
    ],
  },
  {
    id: "confidentiality",
    heading: "Confidentiality",
    blocks: [
      "Each of us may learn confidential information of the other. Each will protect it with at least reasonable care, use it only to perform this agreement, and disclose it only to people who need it and are bound to keep it confidential. This does not cover information that is public through no fault of the recipient, was already known, is independently developed, or is lawfully received from someone else.",
      "If a legal process compels disclosure, the recipient will give notice where it is lawful to do so, and disclose only what is required.",
    ],
  },
  {
    id: "term",
    heading: "Term, suspension and termination",
    blocks: [
      {
        list: [
          "This agreement runs while you have an account.",
          "**You** may cancel at any time from Settings. Cancellation takes effect at the end of the paid period unless our [Subscription and refund terms](/subscription-terms) say otherwise.",
          "**We** may terminate for material breach that is not cured within 30 days of written notice, or immediately for a breach of the [Acceptable Use Policy](/acceptable-use) that causes or threatens harm.",
          "**We may suspend** an account or a single channel immediately where there is a security threat, a connected network requires it, non-payment persists more than 15 days after notice, or the law requires it. Suspension is the narrowest and shortest we can make it.",
          "On termination your right to use the service stops. **For 30 days afterwards you may export your data.** After that we delete or de-identify it, as described in the [DPA](/dpa) and section 7 of the [Privacy policy](/privacy).",
        ],
      },
    ],
  },
  {
    id: "warranties",
    heading: "Warranties and disclaimers",
    blocks: [
      "We warrant that we will provide the service with reasonable skill and care, and that we will not materially reduce its security during a paid term.",
      'Otherwise the service is provided "as is". **To the fullest extent the law allows, we disclaim all other warranties, express or implied, including merchantability, fitness for a particular purpose, non-infringement, and any warranty arising from course of dealing or trade usage.** We do not warrant that the service will be uninterrupted or error-free, that any network will accept a given post, that metrics reported by a network are accurate, or that AI output will be correct.',
      "Some jurisdictions do not allow certain exclusions, so parts of this section may not apply to you.",
    ],
  },
  {
    id: "liability",
    heading: "Limitation of liability",
    blocks: [
      "**Neither party is liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue, goodwill, or data, however caused and on any theory of liability, even if told such damages were possible.**",
      "**Each party's total liability arising out of or relating to this agreement is limited to the fees you paid or owed us in the 12 months before the event giving rise to the claim.**",
      "These limits do not apply to your payment obligations, to either party's indemnity obligations, to a breach of confidentiality, or to liability that cannot be limited by law — including, in some places, death or personal injury caused by negligence, and fraud.",
    ],
  },
  {
    id: "indemnity",
    heading: "Indemnity",
    blocks: [
      "You will defend us against third-party claims arising from your content, your use of the service in breach of this agreement or the [Acceptable Use Policy](/acceptable-use), or your breach of a connected network's terms, and you will pay damages and costs finally awarded or agreed in settlement.",
      "We will defend you against third-party claims that the service, used as permitted, infringes a US patent, copyright or trademark, and we will pay damages and costs finally awarded or agreed. If such a claim is made we may modify the service, obtain a licence, or terminate and refund the unused portion of your fees.",
      "Each side must be told of a claim promptly, given control of the defence, and given reasonable cooperation. No settlement that admits fault or imposes obligations on the other side may be made without its consent.",
    ],
  },
  {
    id: "governing-law",
    heading: "Governing law and disputes",
    blocks: [
      `This agreement is governed by the laws of ${ENTITY.governingLaw}, without regard to its conflict-of-laws rules. The UN Convention on Contracts for the International Sale of Goods does not apply.`,
      `Before filing anything, contact us at [${CONTACT.legal}](mailto:${CONTACT.legal}) and give us 30 days to resolve the dispute informally. Most problems end there.`,
      `If that fails, the state and federal courts located in ${ENTITY.venue} have exclusive jurisdiction, and each of us consents to personal jurisdiction and venue there. Either of us may seek injunctive relief in any court to protect intellectual property or confidential information.`,
      "If you are a consumer resident in the EEA or UK, nothing here deprives you of the protection of the mandatory laws of your country of residence, or of the right to bring proceedings there.",
    ],
  },
  {
    id: "changes",
    heading: "Changes to these terms",
    blocks: [
      "We may change these terms. For changes that materially affect your rights or obligations we will give at least 30 days' notice by email or in the product, and the change takes effect at your next renewal. Continuing to use the service after that means you accept the change. If you do not, cancel before it takes effect and we will refund the unused portion of your current term.",
    ],
  },
  {
    id: "general",
    heading: "General",
    blocks: [
      {
        list: [
          "**Entire agreement.** These terms and the documents they incorporate are the whole agreement between us on their subject matter and replace anything said or written earlier. Terms on your purchase order do not apply.",
          "**Assignment.** Neither of us may assign this agreement without the other's consent, except to a successor in a merger or sale of substantially all assets, on notice.",
          `**Notices.** We notify you by email to your account address or in the product. You notify us at [${CONTACT.legal}](mailto:${CONTACT.legal}) with a copy by post to ${ENTITY.legalName}, ${formattedAddress()}.`,
          "**Force majeure.** Neither of us is liable for failure caused by something beyond reasonable control, excluding payment obligations.",
          "**Severability and waiver.** If a provision is unenforceable it is narrowed to the minimum extent needed and the rest stands. Not enforcing a right is not a waiver of it.",
          "**No publicity.** We will not use your name or logo as a customer reference without your written permission.",
          "**Independent contractors.** Nothing here creates a partnership, agency or employment relationship.",
        ],
      },
    ],
  },
];
