import type { BillingData } from "@/lib/billing/queries";
import { SEATS_LINE, stateSummary } from "@/lib/billing/view";
import { ManageBilling } from "./manage-buttons";
import { PlanAlerts } from "./plan-alerts";

/** The plan, in the organization's terms. */
export function PlanCard({ workspaceId, data }: { workspaceId: string; data: BillingData }) {
  return (
    <section aria-labelledby="billing-plan">
      <h3 id="billing-plan" className="text-base font-semibold">Plan</h3>
      <p className="mt-1 text-sm leading-relaxed text-secondary">
        {stateSummary(data.entitlements.state, { gracefulUntil: data.gracefulUntil })}
      </p>
      <PlanAlerts data={data} />
      <PlanFacts data={data} />
      {data.canManage && data.configured && (
        <ManageBilling workspaceId={workspaceId} offers={data.offers} hasSubscription={data.entitlements.state !== "none"} />
      )}
    </section>
  );
}

function PlanFacts({ data }: { data: BillingData }) {
  return (
    <dl className="mt-4 grid max-w-140 grid-cols-[160px_1fr] gap-y-3 text-sm">
      <dt className="text-secondary/70">Status</dt>
      <dd className="font-medium">{data.statusLabel}</dd>
      {data.planLabel && (
        <>
          <dt className="text-secondary/70">Plan</dt>
          <dd>{data.planLabel}{data.planPrice ? ` · ${data.planPrice}` : ""}</dd>
        </>
      )}
      <dt className="text-secondary/70">Workspaces</dt>
      <dd>
        {data.workspaceQuantity} billed
        {data.activeWorkspaces !== data.workspaceQuantity && <span className="text-secondary"> · {data.activeWorkspaces} active</span>}
      </dd>
      <dt className="text-secondary/70">Seats</dt>
      <dd>{SEATS_LINE}</dd>
      {data.trialEndsOn && (
        <>
          <dt className="text-secondary/70">Trial ends</dt>
          <dd>{data.trialEndsOn}</dd>
        </>
      )}
      {data.renewsOn && (
        <>
          <dt className="text-secondary/70">{data.cancelsOn ? "Access until" : "Renews"}</dt>
          <dd>{data.cancelsOn ?? data.renewsOn}</dd>
        </>
      )}
    </dl>
  );
}
