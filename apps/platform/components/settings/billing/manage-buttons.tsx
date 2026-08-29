"use client";

import { useState } from "react";
import { Button } from "@wizeworks/silicaui-react";
import { openBillingPortal, startSubscription } from "@/lib/actions/billing";
import { useActionFeedback } from "@/lib/use-action-feedback";
import type { PlanOffer } from "@/lib/billing/queries";

type Props = { workspaceId: string; offers: PlanOffer[]; hasSubscription: boolean };

/**
 * Checkout and the customer portal are Stripe-hosted: these buttons only fetch
 * a one-time URL and follow it. Nothing is charged in our UI.
 */
export function ManageBilling({ workspaceId, offers, hasSubscription }: Props) {
  const { run, pending } = useActionFeedback();
  const [plan, setPlan] = useState(offers[0]?.key ?? "");

  const go = (r: { url?: string }) => {
    if (r.url) window.location.assign(r.url);
  };

  if (hasSubscription) {
    return (
      <Button className="mt-5" color="neutral" variant="outline" disabled={pending} onClick={() => run(() => openBillingPortal({ workspaceId }), go)}>
        Manage billing
      </Button>
    );
  }
  if (offers.length === 0) return null;
  return (
    <div className="mt-5 flex flex-wrap items-end gap-3">
      {offers.length > 1 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Billing term</span>
          <select className="select select-sm w-auto" value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Billing term">
            {offers.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
                {o.priceLabel ? ` — ${o.priceLabel}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <Button color="primary" disabled={pending || !plan} onClick={() => run(() => startSubscription({ workspaceId, planKey: plan }), go)}>
        Start subscription
      </Button>
    </div>
  );
}
