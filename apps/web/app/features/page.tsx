import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/marketing/section";
import { FeatureGrid, StepList } from "@/components/marketing/feature-grid";
import { CtaBand } from "@/components/marketing/cta-band";
import {
  ENGAGE_FEATURES,
  FOUNDATION_FEATURES,
  LIFECYCLE_STEPS,
  MEASURE_FEATURES,
  PLAN_FEATURES,
  PUBLISH_FEATURES,
} from "@/content/marketing/features";

export const metadata: Metadata = {
  title: "Features — RocketEase",
  description:
    "Plan, publish, engage and measure social marketing in one workflow: calendar, campaigns, brand hub, unified inbox, approvals, analytics and conversion tracking.",
};

export default function FeaturesPage() {
  return (
    <PageShell>
      <PageHeader
        title="Everything the work actually needs, in one workflow"
        lede="RocketEase is organized around the lifecycle of a piece of social marketing rather than around a feature list. Here is what each stage gives you."
      />

      <Section id="lifecycle" heading="The lifecycle" lede="Four stages, one system of record. Nothing is re-keyed between them.">
        <StepList steps={LIFECYCLE_STEPS} />
      </Section>

      <Section id="plan" heading="Plan" lede="Decide what is going out, when, on which channels, and whether it is on brand — before anyone starts writing." tone="muted">
        <FeatureGrid features={PLAN_FEATURES} columns={2} />
      </Section>

      <Section id="publish" heading="Publish" lede="Compose once, adapt per network, and get it there reliably.">
        <FeatureGrid features={PUBLISH_FEATURES} columns={2} />
      </Section>

      <Section id="engage" heading="Engage" lede="Every inbound message from every channel in one queue." tone="muted">
        <FeatureGrid features={ENGAGE_FEATURES} />
      </Section>

      <Section id="measure" heading="Measure" lede="Organic and paid in one view, with attribution that does not flatter itself.">
        <FeatureGrid features={MEASURE_FEATURES} columns={2} />
      </Section>

      <Section id="foundation" heading="Underneath all of it" tone="muted">
        <FeatureGrid features={FOUNDATION_FEATURES} />
      </Section>

      <CtaBand />
    </PageShell>
  );
}
