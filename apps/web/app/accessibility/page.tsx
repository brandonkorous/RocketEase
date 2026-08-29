import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/document";
import { ACCESSIBILITY } from "@/content/legal";

export const metadata: Metadata = { title: `${ACCESSIBILITY.heading} — RocketEase`, description: ACCESSIBILITY.lede };

export default function Page() {
  return <LegalDocument doc={ACCESSIBILITY} />;
}
