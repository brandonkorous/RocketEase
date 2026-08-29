import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/document";
import { PRIVACY } from "@/content/legal";

export const metadata: Metadata = { title: `${PRIVACY.heading} — RocketEase`, description: PRIVACY.lede };

export default function Page() {
  return <LegalDocument doc={PRIVACY} />;
}
