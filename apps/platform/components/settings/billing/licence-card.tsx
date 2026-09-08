import { Alert, AlertContent } from "@wizeworks/silicaui-react";
import type { BillingData } from "@/lib/billing/queries";
import type { LicenceView } from "@/lib/billing/licence-view";
import { SEATS_LINE, stateSummary } from "@/lib/billing/view";

/** Settings › Billing on a self-hosted install: the licence instead of a plan. */
export function LicenceCard({ data, licence }: { data: BillingData; licence: LicenceView }) {
  return (
    <section aria-labelledby="billing-licence">
      <h3 id="billing-licence" className="text-base font-semibold">Licence</h3>
      <p className="mt-1 text-sm leading-relaxed text-secondary">{stateSummary(data.entitlements.state, { gracefulUntil: data.gracefulUntil, active: data.entitlements.active })}</p>
      <LicenceAlerts data={data} licence={licence} />
      <dl className="mt-4 grid max-w-140 grid-cols-[160px_1fr] gap-y-3 text-sm">
        <dt className="text-secondary/70">Status</dt>
        <dd className="font-medium">{licence.statusLabel}</dd>
        {licence.licensee && (<><dt className="text-secondary/70">Licensed to</dt><dd>{licence.licensee}</dd></>)}
        {licence.expiresOn && (<><dt className="text-secondary/70">{licence.state === "licensed" ? "Valid until" : "Expired on"}</dt><dd>{licence.expiresOn}</dd></>)}
        {licence.evaluationEndsOn && (<><dt className="text-secondary/70">Evaluation ends</dt><dd>{licence.evaluationEndsOn}</dd></>)}
        <dt className="text-secondary/70">Workspaces</dt>
        <dd>
          {licence.state === "unlicensed" ? "1 during the evaluation" : licence.workspaces === null ? "Unlimited" : `${licence.workspaces} allowed`}
          <span className="text-secondary"> · {data.activeWorkspaces} active</span>
        </dd>
        <dt className="text-secondary/70">Seats</dt>
        <dd>{SEATS_LINE}</dd>
        {licence.keyId && (<><dt className="text-secondary/70">Included features</dt><dd>{licence.features.length ? licence.features.join(", ") : "None"}</dd></>)}
        {licence.channel && (<><dt className="text-secondary/70">Update channel</dt><dd>{licence.channel}</dd></>)}
        {licence.keyId && (<><dt className="text-secondary/70">Key id</dt><dd className="font-mono text-xs">{licence.keyId}</dd></>)}
      </dl>
    </section>
  );
}

function LicenceAlerts({ data, licence }: { data: BillingData; licence: LicenceView }) {
  const setKey = "Set LICENCE_KEY in the install’s Secret and roll the pods.";
  return (
    <>
      {licence.keySet && licence.reason && (
        <Alert color="error" className="mt-3"><AlertContent><p className="font-semibold">The licence key could not be used.</p><p className="mt-1 text-sm">{licence.reason} Until then this install runs as an evaluation.</p></AlertContent></Alert>
      )}
      {!licence.keySet && (
        <Alert color="info" className="mt-3"><AlertContent><p className="font-semibold">No licence key is set.</p><p className="mt-1 text-sm">This install is running as an evaluation: one workspace, and scheduling until the evaluation ends. {setKey}</p></AlertContent></Alert>
      )}
      {licence.state === "licence_grace" && licence.graceUntil && (
        <Alert color="warning" className="mt-3"><AlertContent><p className="font-semibold">The licence has expired.</p><p className="mt-1 text-sm">Everything keeps working until {licence.graceUntil}. After that, new scheduling and new workspaces pause until a new key is set. Nothing you have is deleted.</p></AlertContent></Alert>
      )}
      {!data.entitlements.active && (
        <Alert color="error" className="mt-3"><AlertContent><p className="font-semibold">New scheduling is paused.</p><p className="mt-1 text-sm">Everything already scheduled still publishes, and everything stays readable and exportable. {setKey}</p></AlertContent></Alert>
      )}
    </>
  );
}
