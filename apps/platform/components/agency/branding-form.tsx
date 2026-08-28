"use client";

import { useState } from "react";
import { Button } from "@wizeworks/silicaui-react";
import { saveAgencyBranding } from "@/lib/actions/agency/branding";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { LogoPanel } from "./logo-panel";

export type BrandingView = { agencyName: string; footerText: string; replyTo: string; logoUrl: string | null };

/** Agency identity used on every client-facing report and email. Monochrome by rule: a logo and words, no accent colour. */
export function BrandingForm({ organizationId, initial, canEdit }: { organizationId: string; initial: BrandingView; canEdit: boolean }) {
  const { run, pending } = useActionFeedback();
  const [v, setV] = useState({ agencyName: initial.agencyName, footerText: initial.footerText, replyTo: initial.replyTo });
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveAgencyBranding(organizationId, v));
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-secondary">Agency name</span>
          <input className="input input-sm" value={v.agencyName} disabled={!canEdit} onChange={(e) => set("agencyName", e.target.value)} placeholder="Your agency" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-secondary">Reply-to address</span>
          <input className="input input-sm" type="email" value={v.replyTo} disabled={!canEdit} onChange={(e) => set("replyTo", e.target.value)} placeholder="reports@youragency.com" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-secondary">Report footer</span>
          <textarea className="textarea textarea-sm" rows={2} value={v.footerText} disabled={!canEdit} onChange={(e) => set("footerText", e.target.value)} placeholder="Prepared by Your Agency · hello@youragency.com" />
        </label>
        <p className="text-xs text-secondary/70">Reports stay monochrome; only the logo and these words identify you. Client-facing emails are sent with this reply-to address.</p>
        {canEdit && (
          <Button type="submit" size="sm" color="primary" loading={pending} className="self-start">
            Save branding
          </Button>
        )}
      </form>
      <LogoPanel organizationId={organizationId} logoUrl={initial.logoUrl} canEdit={canEdit} />
    </div>
  );
}
