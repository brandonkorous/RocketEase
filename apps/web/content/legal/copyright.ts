import type { LegalDoc } from "./types";
import { CONTACT, ENTITY, LEGAL_EFFECTIVE, formattedAddress } from "@/lib/site";

export const COPYRIGHT: LegalDoc = {
  slug: "copyright",
  title: "Copyright policy (DMCA)",
  heading: "Copyright policy and DMCA notices",
  lede: "How to tell us that content stored on RocketEase infringes your copyright, how to dispute a removal, and who to send it to.",
  updated: LEGAL_EFFECTIVE,
  sections: [
    {
      id: "position",
      heading: "Our position",
      blocks: [
        "RocketEase stores media and content that customers upload, and publishes it to networks at their direction. We do not select, review or edit that content before it is stored.",
        "We respect copyright, and we respond to properly made notices under the Digital Millennium Copyright Act, 17 U.S.C. § 512. **We terminate the accounts of repeat infringers.**",
      ],
    },
    {
      id: "agent",
      heading: "Designated agent",
      blocks: [
        "Send copyright notices to our designated agent:",
        {
          table: {
            head: ["Field", "Detail"],
            rows: [
              ["Service provider", ENTITY.legalName + " (operating RocketEase)"],
              ["Agent", "Copyright Agent"],
              ["Email", `[${CONTACT.dmca}](mailto:${CONTACT.dmca})`],
              ["Post", formattedAddress()],
            ],
          },
        },
        {
          note: "This address is for copyright notices only. Support requests, feature questions and other legal correspondence sent here will not be answered — use [" + CONTACT.support + "](mailto:" + CONTACT.support + ") instead.",
        },
      ],
    },
    {
      id: "notice",
      heading: "Sending a takedown notice",
      blocks: [
        "To be effective under § 512(c)(3), your notice must be in writing and include all six of the following. A notice missing any of them may not trigger our obligations, and we may ask you to resend it.",
        {
          ordered: true,
          list: [
            "A physical or electronic signature of the copyright owner, or a person authorised to act for them.",
            "Identification of the copyrighted work you say is infringed. If several works at one site are covered, a representative list is enough.",
            "Identification of the material you say is infringing, **with enough detail for us to locate it** — a direct URL, a workspace and asset name, or a published post link.",
            "Your contact details: address, telephone number and email address.",
            "A statement that you have a good-faith belief that the use is not authorised by the copyright owner, its agent, or the law.",
            "A statement that the information in the notice is accurate and, **under penalty of perjury**, that you are authorised to act on behalf of the copyright owner.",
          ],
        },
        "**Misrepresentation carries liability.** Under § 512(f) a person who knowingly and materially misrepresents that material is infringing may be liable for damages, including costs and legal fees. Consider whether the use is a fair use before sending a notice.",
      ],
    },
    {
      id: "what-we-do",
      heading: "What we do when we receive a notice",
      blocks: [
        {
          ordered: true,
          list: [
            "We remove or disable access to the identified material expeditiously.",
            "We notify the customer whose workspace held it, and give them a copy of your notice, including your contact details.",
            "We tell them they may send a counter-notice.",
            "We record the notice against that account for the purposes of our repeat-infringer policy.",
          ],
        },
        "Removing material from RocketEase does not remove anything already published to a social network. If a post is live on Instagram, Facebook, LinkedIn or TikTok, send your notice to that network as well — only the network can take it down there.",
      ],
    },
    {
      id: "counter-notice",
      heading: "Counter-notices",
      blocks: [
        "If your material was removed and you believe it was a mistake or a misidentification, you may send a counter-notice to the same agent. Under § 512(g)(3) it must include:",
        {
          ordered: true,
          list: [
            "Your physical or electronic signature.",
            "Identification of the material removed and where it appeared before removal.",
            "A statement, **under penalty of perjury**, that you have a good-faith belief the material was removed as a result of mistake or misidentification.",
            "Your name, address and telephone number, and a statement that you consent to the jurisdiction of the Federal District Court for the district where you live — or, if you are outside the United States, for any district in which we may be found — and that you will accept service of process from the person who sent the original notice.",
          ],
        },
        "We forward a valid counter-notice to the person who sent the original notice. If they do not tell us within 10 business days that they have filed a court action seeking to restrain the activity, we may restore the material between 10 and 14 business days after receiving your counter-notice.",
      ],
    },
    {
      id: "repeat-infringers",
      heading: "Repeat infringers",
      blocks: [
        "We maintain a record of copyright notices received against each account. In appropriate circumstances, and at our discretion, we disable or terminate the accounts of customers who are the subject of repeated valid notices. A notice that is withdrawn or successfully countered does not count.",
        "Termination for repeat infringement does not entitle you to a refund.",
      ],
    },
    {
      id: "trademark",
      heading: "Trademark and other rights",
      blocks: [
        `The DMCA covers copyright only. For trademark, right-of-publicity, or other intellectual-property complaints, write to [${CONTACT.legal}](mailto:${CONTACT.legal}) with your registration or other basis for the right, the material at issue, and how it infringes. We handle those under our [Acceptable Use Policy](/acceptable-use).`,
      ],
    },
  ],
};
