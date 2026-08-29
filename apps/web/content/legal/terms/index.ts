import type { LegalDoc } from "../types";
import { LEGAL_EFFECTIVE } from "@/lib/site";
import { SERVICE_SECTIONS } from "./service";
import { LEGAL_SECTIONS } from "./legal";

export const TERMS: LegalDoc = {
  slug: "terms",
  title: "Terms of service",
  heading: "Terms of service",
  lede: "The agreement between you and WizeWork LLC covering your use of RocketEase — accounts, your content, connected networks, fees, liability and how disputes are handled.",
  updated: LEGAL_EFFECTIVE,
  sections: [...SERVICE_SECTIONS, ...LEGAL_SECTIONS],
};
