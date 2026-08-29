import type { LegalSection } from "../types";
import { CONTACT } from "@/lib/site";

export const DPA_RIGHTS_SECTIONS: LegalSection[] = [
  {
    id: "data-subject-rights",
    heading: "Assistance with data subject rights",
    blocks: [
      "The product itself is the primary mechanism: Customer's administrators can search, export, correct and delete Customer Data directly, which satisfies most access, rectification, portability and erasure requests without involving us.",
      "Where a request cannot be satisfied in the product, RocketEase will provide reasonable assistance, taking into account the nature of the processing. **If a data subject contacts RocketEase directly about Customer Data, RocketEase will not respond substantively — it will refer them to Customer and tell Customer promptly.**",
    ],
  },
  {
    id: "breach",
    heading: "Personal data breach",
    blocks: [
      "**RocketEase will notify Customer without undue delay, and in any event within 48 hours, of becoming aware of a personal data breach affecting Customer Data.**",
      "The notification will describe the nature of the breach, the categories and approximate number of data subjects and records affected, the likely consequences, the measures taken or proposed, and a contact point — to the extent known at the time, with updates as the investigation proceeds.",
      "RocketEase will assist Customer with its own notification obligations to regulators and data subjects. Notification is not an admission of fault.",
    ],
  },
  {
    id: "dpia",
    heading: "Impact assessments and prior consultation",
    blocks: [
      "RocketEase will provide reasonable assistance with data protection impact assessments and prior consultations with supervisory authorities, to the extent they relate to RocketEase's processing and Customer cannot reasonably obtain the information itself. The security measures in section 5 and the subprocessor list are provided for that purpose.",
    ],
  },
  {
    id: "audit",
    heading: "Audit",
    blocks: [
      "RocketEase will make available the information reasonably necessary to demonstrate compliance with this DPA, including its security documentation and, where available, third-party assessment reports.",
      "Customer may audit no more than once in any 12-month period, on 30 days' written notice, during business hours, without unreasonably disrupting the service, subject to confidentiality, and at Customer's cost — unless the audit reveals material non-compliance, in which case RocketEase bears the reasonable cost. A regulator's exercise of its own audit powers is not subject to these limits.",
    ],
  },
  {
    id: "deletion",
    heading: "Return and deletion",
    blocks: [
      {
        list: [
          "During the term, Customer may export Customer Data at any time from the product.",
          "**For 30 days after termination, Customer retains export access.**",
          "After that period RocketEase deletes or irreversibly de-identifies Customer Data from live systems within a further 30 days.",
          "Backups age out on a rolling 35-day cycle; deleted data is not restored to live systems from backup.",
          "**Provider access tokens are deleted immediately on disconnection or termination, not at the end of any retention window.**",
          "RocketEase may retain data where law requires it, and will keep it confidential and process it only for that purpose.",
        ],
      },
      "Content already published to a social network is outside RocketEase's control and is not deleted by this section. Customer must remove it at the network.",
    ],
  },
  {
    id: "transfers",
    heading: "International transfers",
    blocks: [
      "Customer Data is stored in the United States.",
      {
        list: [
          "For transfers from the EEA, the **Standard Contractual Clauses** approved by Commission Implementing Decision (EU) 2021/914 are incorporated into this DPA. **Module Two** (controller to processor) applies where Customer is a controller; **Module Three** (processor to processor) applies where Customer is itself a processor.",
          "Clause 7 (docking) applies. Under Clause 9, **Option 2** (general written authorisation) applies with the 30-day notice period in section 6. Under Clause 17, the Clauses are governed by the law of Ireland. Under Clause 18(b), disputes are resolved in the courts of Ireland.",
          "Annex I is populated by section 3 of this DPA and the [subprocessors page](/subprocessors); Annex II by section 5.",
          "For transfers from the United Kingdom, the **UK International Data Transfer Addendum** (version B1.0) is incorporated, with the Approved Addendum's tables completed by reference to this DPA.",
          "For transfers from Switzerland, references to the GDPR are read as references to the Swiss FADP, and the Swiss Federal Data Protection and Information Commissioner is the competent authority.",
        ],
      },
    ],
  },
  {
    id: "us-state-law",
    heading: "United States state privacy law",
    blocks: [
      "Where the California Consumer Privacy Act applies, RocketEase is a **service provider**, and the parties acknowledge that Customer Data is disclosed for the limited and specified business purpose of providing the service, and not sold or shared. RocketEase will not:",
      {
        list: [
          "retain, use or disclose Customer Data for any purpose other than performing the service, or as otherwise permitted by the CCPA;",
          "sell or share Customer Data;",
          "retain, use or disclose it outside the direct business relationship between the parties; or",
          "combine it with personal information from another source, except as the CCPA permits a service provider to do.",
        ],
      },
      "RocketEase certifies that it understands and will comply with these restrictions. Equivalent terms apply where Virginia, Colorado, Connecticut, Utah, Texas, Oregon, Montana or another state's comprehensive privacy law governs, and RocketEase acts as a **processor** under those laws.",
    ],
  },
  {
    id: "general",
    heading: "General",
    blocks: [
      "The liability limits in the [Terms of Service](/terms) apply to this DPA. This DPA is governed by the same law as the Terms, except that the Standard Contractual Clauses are governed as stated in section 11.",
      "If a provision of this DPA is held invalid, the rest stands. If data-protection law changes so that this DPA no longer complies, the parties will negotiate an amendment in good faith.",
      "Questions and countersignature requests: [" + CONTACT.legal + "](mailto:" + CONTACT.legal + ").",
    ],
  },
];
