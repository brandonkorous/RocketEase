import type { Metadata } from "next";
import { PUBLIC_CAPABILITY_CATALOG } from "@rocketease/providers";
import { CapabilityMatrix } from "@/components/capabilities/matrix";
import { CapabilityNotes } from "@/components/capabilities/notes";

export const metadata: Metadata = {
  title: "Network capabilities",
  description: "What RocketEase can and can't do on each social network, and why.",
  robots: { index: true, follow: true },
};

/*
 * The capability contract, public and unauthenticated. Rendered from
 * CAPABILITY_CATALOG in @rocketease/providers — the same declarations the
 * product enforces at publish time, so this page cannot promise more than the
 * code does.
 */
export default function CapabilitiesPage() {
  const entries = PUBLIC_CAPABILITY_CATALOG;
  return (
    <>
      <header className="max-w-200">
        <h1 className="app-title">What we can and can&apos;t do on each network — and why.</h1>
        <p className="mt-3 text-base leading-relaxed text-secondary">
          Each network&apos;s API decides what any tool is allowed to do with it. This is the full list for RocketEase, generated from the
          capability declarations the product itself enforces: if a control is switched off in the app, it is off for one of the reasons below.
        </p>
      </header>
      <Legend />
      <CapabilityMatrix entries={entries} />
      <CapabilityNotes entries={entries} />
      <p className="mt-12 border-t border-base-300 pt-6 text-sm text-secondary">
        Capabilities reflect each network&apos;s public API. We update this page when a network changes.
      </p>
    </>
  );
}

function Legend() {
  return (
    <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-secondary">
      <div className="flex gap-2"><dt aria-hidden>✓</dt><dd>Supported</dd></div>
      <div className="flex gap-2"><dt aria-hidden>✓*</dt><dd>Supported with a condition — an extra permission, tier, or account type. Read Why below</dd></div>
      <div className="flex gap-2"><dt aria-hidden>—</dt><dd>Not available — hover a cell, or read Why below</dd></div>
    </dl>
  );
}
