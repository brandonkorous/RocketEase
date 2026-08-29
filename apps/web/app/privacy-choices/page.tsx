import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/document";
import { PRIVACY_CHOICES } from "@/content/legal";

export const metadata: Metadata = { title: `${PRIVACY_CHOICES.heading} — RocketEase`, description: PRIVACY_CHOICES.lede };

export default function Page() {
  return <LegalDocument doc={PRIVACY_CHOICES} />;
}
