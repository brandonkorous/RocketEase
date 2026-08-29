import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/document";
import { SUBSCRIPTION_TERMS } from "@/content/legal";

export const metadata: Metadata = { title: `${SUBSCRIPTION_TERMS.heading} — RocketEase`, description: SUBSCRIPTION_TERMS.lede };

export default function Page() {
  return <LegalDocument doc={SUBSCRIPTION_TERMS} />;
}
