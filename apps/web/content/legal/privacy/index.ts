import type { LegalDoc } from "../types";
import { LEGAL_EFFECTIVE } from "@/lib/site";
import { SCOPE_SECTIONS } from "./scope";
import { DATA_SECTIONS } from "./data";
import { RIGHTS_SECTIONS } from "./rights";

export const PRIVACY: LegalDoc = {
  slug: "privacy",
  title: "Privacy policy",
  heading: "Privacy policy",
  lede: "What personal information RocketEase handles, why, who we share it with, how long we keep it, and the choices you have.",
  updated: LEGAL_EFFECTIVE,
  sections: [...SCOPE_SECTIONS, ...DATA_SECTIONS, ...RIGHTS_SECTIONS],
};
