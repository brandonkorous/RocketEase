import type { LegalSection } from "../types";
import { CONTACT, ENTITY } from "@/lib/site";

export const RIGHTS_SECTIONS: LegalSection[] = [
  {
    id: "sharing",
    heading: "Who we share it with",
    blocks: [
      {
        list: [
          "**Service providers** who host, secure, bill and support the product. Every one is listed, with its purpose and location, on our [subprocessors page](/subprocessors). They act on our instructions and may not use your information for their own purposes.",
          "**Social networks and connected systems**, when you ask us to publish, reply, or read data on your behalf.",
          "**People inside your organization**, according to the workspace roles your administrators set.",
          "**Agencies and their clients**, where an agency administers your workspace or you have granted a client approver access.",
          "**Authorities**, where a valid legal process compels it. We will tell you before we disclose unless we are legally forbidden from doing so.",
          "**An acquirer**, if we are involved in a merger, acquisition or sale of assets. We will notify you before your information becomes subject to a different policy.",
        ],
      },
      "**We do not sell personal information, and we do not share it for cross-context behavioural advertising**, as those terms are defined by California law.",
    ],
  },
  {
    id: "transfers",
    heading: "International transfers",
    blocks: [
      "We store production data in Microsoft Azure regions in the United States. If you are in the United Kingdom, the European Economic Area, or Switzerland, your information is transferred outside your country.",
      "Those transfers rely on the European Commission's Standard Contractual Clauses, and on the UK International Data Transfer Addendum where the UK GDPR applies. Our [DPA](/dpa) incorporates both. We also apply the supplementary technical measures described in section 10.",
    ],
  },
  {
    id: "security",
    heading: "How we protect it",
    blocks: [
      {
        list: [
          "TLS 1.2 or better on every connection; encryption at rest for the database and object storage.",
          "Provider access tokens sealed in AES-256-GCM envelopes bound to the record id, with key rotation by key identifier and the master key held in Azure Key Vault.",
          "Tenancy enforced on the server for every request. A user who is not a member of a workspace cannot learn that the workspace exists.",
          "Optional two-factor authentication with TOTP and backup codes, session listing and revocation, and step-up re-authentication before high-risk actions.",
          "Append-only audit records for sensitive actions.",
          "Uploaded media is scanned before it can be published.",
          "Least-privilege database roles; migrations run in-cluster, never from a workstation.",
        ],
      },
      "No system is perfectly secure. If we become aware of a breach affecting your personal information we will notify you and, where required, the relevant regulator, without undue delay. Report a vulnerability to [" + CONTACT.security + "](mailto:" + CONTACT.security + ") — see our [security page](/security).",
    ],
  },
  {
    id: "rights",
    heading: "Your rights",
    blocks: [
      "Depending on where you live you may have the right to access, correct, delete, port, or restrict our use of your personal information; to object to processing based on legitimate interests; to withdraw consent; and not to be discriminated against for exercising any of these.",
      "Most of these you can exercise yourself in the product: Settings shows your data, your sessions, and your connections, and lets you export or delete. For anything else, use [Data deletion and your rights](/data-deletion) or email [" + CONTACT.privacy + "](mailto:" + CONTACT.privacy + ").",
      "We answer within 30 days, or 45 days where California law allows an extension and we tell you why. We may ask you to verify your identity; we will not ask for more information than is necessary to do so. An authorized agent may act for you with written permission.",
      "If you are in the UK or EEA you may complain to your supervisory authority. We would rather you told us first.",
    ],
  },
  {
    id: "state-disclosures",
    heading: "United States state privacy disclosures",
    blocks: [
      "This section supplements the rest of the policy for residents of California, Virginia, Colorado, Connecticut, Utah, Texas, Oregon, Montana and other states with comprehensive privacy laws.",
      "In the past 12 months we collected the categories in section 4, from the sources in section 3, for the purposes stated there, and disclosed them for business purposes to the recipients in section 8. We collect no sensitive personal information beyond account credentials and two-factor secrets, which we use only to authenticate you — never to infer characteristics about you.",
      {
        list: [
          "**We do not sell your personal information** and have not done so in the past 12 months.",
          "**We do not share it for cross-context behavioural advertising** and have not done so in the past 12 months.",
          "**We do not knowingly process the personal information of anyone under 16.**",
          "We honour the **Global Privacy Control** signal automatically. See [Your privacy choices](/privacy-choices).",
        ],
      },
      `California's "Shine the Light" law lets California residents request the identities of third parties to whom we disclosed personal information for their direct marketing purposes. We do not make such disclosures. Write to [${CONTACT.privacy}](mailto:${CONTACT.privacy}) to confirm.`,
    ],
  },
  {
    id: "children",
    heading: "Children",
    blocks: [
      `${ENTITY.productName} is a business product. It is not directed to children, and we do not knowingly collect personal information from anyone under 16. If you believe a child has given us information, write to [${CONTACT.privacy}](mailto:${CONTACT.privacy}) and we will delete it.`,
    ],
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    blocks: [
      "We update this policy when the product or the law changes. The date at the top always reflects the current version. If a change materially reduces your rights or expands how we use your information, we will tell you by email or in the product at least 30 days before it takes effect.",
    ],
  },
];
