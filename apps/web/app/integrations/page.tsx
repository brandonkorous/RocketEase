import type { Metadata } from "next";
import { Badge } from "@wizeworks/silicaui-react";
import { PlatformIcon } from "@rocketease/ui/icons";
import { PageShell } from "@/components/page-shell";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/marketing/section";
import { CtaBand } from "@/components/marketing/cta-band";
import { Inline } from "@/components/legal/inline";
import { CAPABILITY_NOTE, DATA_SOURCES, INTEGRATIONS, STATUS_LABEL, STATUS_NOTE, type Integration } from "@/content/marketing/integrations";

export const metadata: Metadata = {
  title: "Integrations — RocketEase",
  description:
    "Which social networks and data sources RocketEase connects to, what each connection can actually do, and the honest status of every one.",
};

export default function IntegrationsPage() {
  return (
    <PageShell>
      <PageHeader
        title="Integrations"
        lede="What each connection can actually do — and where it really stands. Networks approve apps on their own timetable, so we publish status rather than promises."
      />

      <Section id="networks" heading="Social networks">
        <ul className="grid gap-px overflow-hidden rounded-box border border-base-300 bg-base-300 md:grid-cols-2">
          {INTEGRATIONS.map((i) => (
            <IntegrationCard key={i.platform} integration={i} />
          ))}
        </ul>
        <dl className="mt-8 grid gap-5 sm:grid-cols-3">
          {(["review", "built", "planned"] as const).map((s) => (
            <div key={s}>
              <dt className="text-sm font-semibold text-base-content">{STATUS_LABEL[s]}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-secondary">{STATUS_NOTE[s]}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="capability" heading="Capability is per channel, not per network" tone="muted">
        <div className="max-w-3xl space-y-5 text-base leading-relaxed text-secondary">
          {CAPABILITY_NOTE.map((p) => (
            <p key={p}>
              <Inline text={p} />
            </p>
          ))}
        </div>
      </Section>

      <Section id="data" heading="Data sources" lede="Where conversion and revenue data comes from, so analytics can attribute honestly.">
        <ul className="grid gap-px overflow-hidden rounded-box border border-base-300 bg-base-300 sm:grid-cols-2">
          {DATA_SOURCES.map((d) => (
            <li key={d.name} className="bg-base-100 p-6">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-base font-semibold text-base-content">{d.name}</h3>
                <Badge color="neutral" variant="outline" className="shrink-0">
                  {STATUS_LABEL[d.status]}
                </Badge>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-secondary">{d.what}</p>
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand heading="Connect an account and see what it supports" body="The capability model is visible in the product from the moment a channel connects." />
    </PageShell>
  );
}

function IntegrationCard({ integration }: { integration: Integration }) {
  return (
    <li className="bg-base-100 p-6 lg:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <PlatformIcon platform={integration.platform} size={26} />
          <h3 className="text-base font-semibold text-base-content">{integration.name}</h3>
        </div>
        <Badge color="neutral" variant="outline" className="shrink-0">
          {STATUS_LABEL[integration.status]}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-secondary">{integration.what}</p>
      <ul className="mt-4 flex flex-wrap gap-1.5 border-t border-base-300 pt-4">
        {integration.capabilities.map((c) => (
          <li key={c} className="rounded-selector bg-base-200 px-2 py-1 text-xs text-secondary">
            {c}
          </li>
        ))}
      </ul>
    </li>
  );
}
