import { Alert, AlertContent } from "@wizeworks/silicaui-react";
import { AiUsageMeter } from "@/components/ai/usage-meter";
import type { BillingData } from "@/lib/billing/queries";
import { Invoices } from "./invoices";
import { PlanCard } from "./plan-card";
import { WorkspaceCredits } from "./workspace-credits";

type Props = { workspaceId: string; timezone: string; data: BillingData };

/**
 * Settings → Billing. Organization scope: the subscription belongs to the
 * billing boundary, so only its owners and admins see or change it.
 */
export function BillingSettings({ workspaceId, timezone, data }: Props) {
  if (!data.canManage) {
    return (
      <p className="mt-3 max-w-140 text-sm leading-relaxed text-secondary">
        Billing applies to the whole {data.organizationName} organization, so only its owners and admins can see and change
        it. Ask an organization owner if you need access.
      </p>
    );
  }
  return (
    <div className="mt-4 flex max-w-180 flex-col gap-8">
      <p className="text-sm leading-relaxed text-secondary">
        These settings apply to the whole {data.organizationName} organization, not just this workspace.
      </p>

      {!data.configured && (
        <Alert color="info">
          <AlertContent>
            <p className="font-semibold">Billing isn&apos;t configured.</p>
            <p className="mt-1 text-sm">
              This deployment has no Stripe keys, so nothing is charged and nothing is gated. Set <span className="font-mono text-xs">STRIPE_SECRET_KEY</span> and the price ids to turn billing on.
            </p>
          </AlertContent>
        </Alert>
      )}

      <PlanCard workspaceId={workspaceId} data={data} />
      <AiUsageMeter workspaceId={workspaceId} />
      <WorkspaceCredits rows={data.workspaceCredits} periodLabel={data.periodLabel} />
      {data.configured && <Invoices invoices={data.invoices} timezone={timezone} />}
    </div>
  );
}
