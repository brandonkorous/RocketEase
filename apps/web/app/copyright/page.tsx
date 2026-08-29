import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/document";
import { COPYRIGHT } from "@/content/legal";

export const metadata: Metadata = { title: `${COPYRIGHT.heading} — RocketEase`, description: COPYRIGHT.lede };

export default function Page() {
  return <LegalDocument doc={COPYRIGHT} />;
}
