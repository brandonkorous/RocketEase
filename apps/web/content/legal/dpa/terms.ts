import type { LegalSection } from "../types";
import { CONTACT, ENTITY } from "@/lib/site";

export const DPA_SECTIONS: LegalSection[] = [
  {
    id: "parties",
    heading: "Parties and incorporation",
    blocks: [
      `This Data Processing Addendum is between you (the "Customer") and ${ENTITY.legalName} ("${ENTITY.shortName}"). It forms part of the [Terms of Service](/terms) and takes effect when you start using RocketEase. **You do not need to sign it separately** — it applies automatically to every customer.`,
      "If your procurement process needs a countersigned copy, or a copy on your own paper, write to [" + CONTACT.legal + "](mailto:" + CONTACT.legal + ") and we will arrange it.",
      "Where this DPA conflicts with the Terms of Service, this DPA controls for the processing of personal data.",
    ],
  },
  {
    id: "roles",
    heading: "Roles of the parties",
    blocks: [
      "**Customer is the controller (or business, or a processor acting for its own controller). RocketEase is the processor (or service provider) and acts only on Customer's documented instructions.**",
      "Customer's instructions are: the Terms of Service, this DPA, the configuration Customer sets in the product, and the actions Customer's authorised users take. RocketEase will tell Customer if, in its opinion, an instruction breaks data-protection law.",
      "For account registration, billing and RocketEase's own marketing, RocketEase is an independent controller. That processing is described in the [Privacy policy](/privacy), not here.",
    ],
  },
  {
    id: "processing-details",
    heading: "Details of the processing",
    blocks: [
      {
        table: {
          head: ["Item", "Detail"],
          rows: [
            ["Subject matter", "Provision of the RocketEase social marketing platform"],
            ["Duration", "The term of the Terms of Service, plus the deletion period in section 10"],
            ["Nature and purpose", "Hosting, storing, organising, retrieving, transmitting, publishing and analysing Customer Data so that Customer can plan, publish, engage, promote and measure social marketing"],
            ["Types of personal data", "Account identifiers and contact details of Customer's users; profile identifiers, display names, handles, avatars and message content of people who interact with Customer's social channels; audience and conversion data Customer connects; any personal data contained in media Customer uploads"],
            ["Categories of data subjects", "Customer's staff and contractors; Customer's clients where Customer is an agency; members of the public who comment on, message, mention or review Customer's social channels; people depicted in Customer's media"],
            ["Special category data", "Not requested and not required. Customer must not deliberately upload special category data or children's data. Where such data arrives incidentally in an inbound social message, RocketEase processes it only to display and store the message"],
            ["Frequency", "Continuous for the duration of the agreement"],
          ],
        },
      },
    ],
  },
  {
    id: "confidentiality",
    heading: "Personnel and confidentiality",
    blocks: [
      "RocketEase limits access to Customer Data to personnel who need it to deliver or support the service, binds them to written confidentiality obligations that survive their engagement, and trains them on data protection. Access is least-privilege and logged.",
    ],
  },
  {
    id: "security",
    heading: "Security measures",
    blocks: [
      "RocketEase implements the technical and organisational measures set out below, which meet Article 32 of the GDPR. They may be updated, but not materially weakened, during a paid term.",
      {
        list: [
          "**Encryption in transit** — TLS 1.2 or better on all external connections.",
          "**Encryption at rest** — database and object storage encrypted at rest. Provider access tokens are additionally sealed in AES-256-GCM envelopes cryptographically bound to the record that holds them, with rotation by key identifier and the master key held in a managed key vault.",
          "**Tenant isolation** — every workspace-scoped record carries an organization and workspace identifier, and membership is verified on the server for every request. Isolation is covered by automated tests in our release pipeline.",
          "**Access control** — role-based permissions, optional TOTP two-factor authentication with backup codes, session listing and revocation, and step-up re-authentication for high-risk actions.",
          "**Auditability** — append-only audit records of sensitive actions, available to Customer's administrators.",
          "**Malware scanning** — uploaded media is scanned before it can be published.",
          "**Availability** — managed database with point-in-time restore and a rolling 35-day backup window.",
          "**Secure development** — code review, dependency scanning, typed schema migrations applied as an in-cluster job, and restricted database roles that cannot execute schema changes at runtime.",
          "**Telemetry minimisation** — logs and product telemetry exclude message bodies, post text, media and credentials by design.",
        ],
      },
    ],
  },
  {
    id: "subprocessors",
    heading: "Subprocessors",
    blocks: [
      "Customer gives RocketEase a general authorisation to engage the subprocessors listed on the [subprocessors page](/subprocessors), and to engage further subprocessors on the terms below.",
      {
        list: [
          "RocketEase gives **at least 30 days' notice** before a new subprocessor begins processing Customer Data, by updating that page and notifying subscribers.",
          "Customer may object on reasonable data-protection grounds within that period. The parties will work in good faith to find an alternative; failing that, Customer may terminate the affected service and receive a refund of prepaid, unused fees.",
          "Each subprocessor is bound by a written contract imposing obligations no less protective than this DPA.",
          "**RocketEase remains liable to Customer for its subprocessors' performance.**",
        ],
      },
    ],
  },
];
