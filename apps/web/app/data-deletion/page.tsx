import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/document";
import { DATA_DELETION } from "@/content/legal";

export const metadata: Metadata = { title: `${DATA_DELETION.heading} — RocketEase`, description: DATA_DELETION.lede };

export default function Page() {
  return <LegalDocument doc={DATA_DELETION} />;
}
