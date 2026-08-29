import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { NotYet } from "@/components/marketing/not-yet";
import { CtaBand } from "@/components/marketing/cta-band";

export const metadata: Metadata = {
  title: "Partners — RocketEase",
  description: "Agencies, consultants and technology partners.",
};

export default function Page() {
  return (
    <PageShell>
      <PageHeader title="Partners" lede="Agencies, consultants and technology partners." />
      <NotYet
        title="The partner program is not open yet"
        body="We are focused on getting the agency experience right for the agencies already using it before we build a program around it. If you run an agency and want to shape that, we want to talk to you now rather than later."
        action={{ label: "Talk to us about it", href: "/contact" }}
      />
      <CtaBand />
    </PageShell>
  );
}
