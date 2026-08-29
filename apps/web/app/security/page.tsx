import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/document";
import { SECURITY } from "@/content/legal";

export const metadata: Metadata = { title: `${SECURITY.heading} — RocketEase`, description: SECURITY.lede };

export default function Page() {
  return <LegalDocument doc={SECURITY} />;
}
