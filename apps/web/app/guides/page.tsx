import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { NotYet } from "@/components/marketing/not-yet";
import { CtaBand } from "@/components/marketing/cta-band";

export const metadata: Metadata = {
  title: "Guides — RocketEase",
  description: "Practical walkthroughs for getting real work done in RocketEase.",
};

export default function Page() {
  return (
    <PageShell>
      <PageHeader title="Guides" lede="Practical walkthroughs for getting real work done in RocketEase." />
      <NotYet
        title="Guides are being written"
        body="Product help lives in the help center today, and the product itself teaches the first post, the first connection and the first report through designed empty states rather than a manual you have to go find."
        action={{ label: "Go to the help center", href: "/help" }}
      />
      <CtaBand />
    </PageShell>
  );
}
