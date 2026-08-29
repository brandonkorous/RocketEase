import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/document";
import { ACCEPTABLE_USE } from "@/content/legal";

export const metadata: Metadata = { title: `${ACCEPTABLE_USE.heading} — RocketEase`, description: ACCEPTABLE_USE.lede };

export default function Page() {
  return <LegalDocument doc={ACCEPTABLE_USE} />;
}
