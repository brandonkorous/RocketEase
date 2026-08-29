import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { NotYet } from "@/components/marketing/not-yet";
import { CtaBand } from "@/components/marketing/cta-band";

export const metadata: Metadata = {
  title: "Careers — RocketEase",
  description: "Working on RocketEase.",
};

export default function Page() {
  return (
    <PageShell>
      <PageHeader title="Careers" lede="Working on RocketEase." />
      <NotYet
        title="No open roles"
        body="We are a small team and we are not hiring right now. If you are the kind of person who reads a security page looking for what it does not claim, write anyway — we will keep it on file and reply."
        action={{ label: "Introduce yourself", href: "/contact" }}
      />
      <CtaBand />
    </PageShell>
  );
}
