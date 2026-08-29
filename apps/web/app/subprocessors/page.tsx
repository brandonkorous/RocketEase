import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/document";
import { SUBPROCESSORS } from "@/content/legal";

export const metadata: Metadata = { title: `${SUBPROCESSORS.heading} — RocketEase`, description: SUBPROCESSORS.lede };

export default function Page() {
  return <LegalDocument doc={SUBPROCESSORS} />;
}
