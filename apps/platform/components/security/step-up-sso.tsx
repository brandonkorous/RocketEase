"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@wizeworks/silicaui-react";
import { beginSsoStepUp } from "@/lib/actions/security/sso-step-up";
import { useActionFeedback } from "@/lib/use-action-feedback";
import type { StepUpPurpose } from "@/lib/step-up";

/**
 * SSO branch of NFR-001 step-up. The user leaves for their identity provider
 * and comes back to /api/security/step-up/sso, which records the proof and
 * returns them to this page.
 */
export function StepUpSso({ workspaceId, purpose, what, minutes }: { workspaceId: string; purpose: StepUpPurpose; what: string; minutes: number }) {
  const { notify } = useActionFeedback();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  const go = async () => {
    setPending(true);
    const r = await beginSsoStepUp({ workspaceId, purpose, returnTo: pathname });
    if (r.url) {
      window.location.assign(r.url);
      return;
    }
    setPending(false);
    notify(r);
  };

  return (
    <div className="mt-4 rounded-field border border-base-300 bg-base-200 p-3">
      <p className="text-sm font-semibold">Confirm with your identity provider</p>
      <p className="mt-1 text-xs text-secondary">
        {what} requires a fresh sign-in. You&apos;ll return here afterwards and the confirmation stays valid for {minutes} minutes.
      </p>
      <Button type="button" size="sm" color="neutral" variant="outline" className="mt-2" loading={pending} onClick={go}>
        Continue to single sign-on
      </Button>
    </div>
  );
}
