import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { NotYet } from "@/components/marketing/not-yet";
import { CtaBand } from "@/components/marketing/cta-band";

export const metadata: Metadata = {
  title: "Blog — RocketEase",
  description: "Notes on building RocketEase, and on the parts of social marketing software that are usually glossed over.",
};

export default function Page() {
  return (
    <PageShell>
      <PageHeader title="Blog" lede="Notes on building RocketEase, and on the parts of social marketing software that are usually glossed over." />
      <NotYet
        title="Nothing published yet"
        body="We would rather have an empty blog than a filled one. When we have something worth your time — a decision we got wrong, a constraint we found, a thing the networks do that nobody documents — it will be here."
        action={{ label: "Tell us what to write about", href: "/contact" }}
      />
      <CtaBand />
    </PageShell>
  );
}
