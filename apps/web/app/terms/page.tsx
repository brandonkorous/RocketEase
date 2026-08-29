import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/document";
import { TERMS } from "@/content/legal";

export const metadata: Metadata = { title: `${TERMS.heading} — RocketEase`, description: TERMS.lede };

export default function Page() {
  return <LegalDocument doc={TERMS} />;
}
