import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/document";
import { DPA } from "@/content/legal";

export const metadata: Metadata = { title: `${DPA.heading} — RocketEase`, description: DPA.lede };

export default function Page() {
  return <LegalDocument doc={DPA} />;
}
