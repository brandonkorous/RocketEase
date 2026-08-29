import { Alert, AlertContent } from "@wizeworks/silicaui-react";
import type { BillingData } from "@/lib/billing/queries";

/**
 * Billing states that persist until someone acts. design.md keeps Alert for
 * exactly this — a toast would disappear before the problem did.
 */
export function PlanAlerts({ data }: { data: BillingData }) {
  const blocking = !data.entitlements.active && data.configured;
  return (
    <>
      {blocking && (
        <Alert color="error" className="mt-3">
          <AlertContent>
            <p className="font-semibold">New scheduling is paused.</p>
            <p className="mt-1 text-sm">
              Everything already scheduled still publishes, and nothing you have is deleted. Start or fix the subscription to schedule again.
            </p>
          </AlertContent>
        </Alert>
      )}
      {data.entitlements.inGrace && data.gracefulUntil && (
        <Alert color="warning" className="mt-3">
          <AlertContent>
            <p className="font-semibold">A payment didn&apos;t go through.</p>
            <p className="mt-1 text-sm">
              Publishing continues until {data.gracefulUntil}. After that, new scheduling pauses until the payment method is fixed.
            </p>
          </AlertContent>
        </Alert>
      )}
      {data.stripeError && (
        <Alert color="warning" className="mt-3">
          <AlertContent>
            <p className="font-semibold">Stripe couldn&apos;t be reached.</p>
            <p className="mt-1 text-sm">Plan prices and invoices are missing from this page right now. Your subscription is unaffected.</p>
          </AlertContent>
        </Alert>
      )}
    </>
  );
}
