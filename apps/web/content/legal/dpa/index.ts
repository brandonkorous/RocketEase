import type { LegalDoc } from "../types";
import { LEGAL_EFFECTIVE } from "@/lib/site";
import { DPA_SECTIONS } from "./terms";
import { DPA_RIGHTS_SECTIONS } from "./rights";

export const DPA: LegalDoc = {
  slug: "dpa",
  title: "Data processing addendum",
  heading: "Data processing addendum",
  lede: "Our commitments when we process personal data on your behalf: security measures, subprocessors, breach notification, deletion, and the Standard Contractual Clauses for international transfers.",
  updated: LEGAL_EFFECTIVE,
  sections: [...DPA_SECTIONS, ...DPA_RIGHTS_SECTIONS],
};
