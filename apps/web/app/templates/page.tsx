import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { NotYet } from "@/components/marketing/not-yet";
import { CtaBand } from "@/components/marketing/cta-band";

export const metadata: Metadata = {
  title: "Templates — RocketEase",
  description: "Starting points for campaigns, content calendars and reports.",
};

export default function Page() {
  return (
    <PageShell>
      <PageHeader title="Templates" lede="Starting points for campaigns, content calendars and reports." />
      <NotYet
        title="No templates yet"
        body="We are not going to ship a library of generic captions. Templates will come from patterns we have actually seen work, and we have not earned the right to claim those yet. The brand hub is the real starting point — it makes drafting sound like you instead of like a template."
        action={{ label: "See how the brand hub works", href: "/features" }}
      />
      <CtaBand />
    </PageShell>
  );
}
