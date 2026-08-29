import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/document";
import { COOKIES } from "@/content/legal";

export const metadata: Metadata = { title: `${COOKIES.heading} — RocketEase`, description: COOKIES.lede };

export default function Page() {
  return <LegalDocument doc={COOKIES} />;
}
