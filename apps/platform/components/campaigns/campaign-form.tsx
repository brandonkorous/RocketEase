"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@wizeworks/silicaui-react";
import { createCampaign, updateCampaign, type CampaignInput } from "@/lib/actions/campaigns";
import { OBJECTIVE_LABEL } from "@/lib/campaigns/format";
import { workspacePath } from "@/lib/nav";
import { useActionFeedback } from "@/lib/use-action-feedback";

export type CampaignFormInitial = Partial<CampaignInput> & { id?: string };
type Props = { workspaceId: string; initial: CampaignFormInitial; members: { id: string; name: string }[]; defaultOwnerId?: string; onDone?: () => void };

const Field = ({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) => (
  <label className={`flex flex-col gap-1 text-sm ${className}`}><span className="text-xs font-medium text-secondary">{label}</span>{children}</label>
);

/** Create/edit form (flows.md step 1): name, objective, dates, owner, optional budget, tracking. */
export function CampaignForm({ workspaceId, initial, members, defaultOwnerId, onDone }: Props) {
  const router = useRouter();
  const { run, pending } = useActionFeedback();
  const [v, setV] = useState<CampaignInput>({
    name: initial.name ?? "", description: initial.description ?? "", objective: initial.objective ?? "engagement", startAt: initial.startAt ?? "", endAt: initial.endAt ?? "",
    ownerUserId: initial.ownerUserId ?? defaultOwnerId ?? "", budgetAmount: initial.budgetAmount ?? "", currency: initial.currency ?? "USD", tracking: initial.tracking ?? {}, tags: initial.tags ?? [],
  });
  const [tags, setTags] = useState(v.tags.join(", "));
  const set = <K extends keyof CampaignInput>(k: K, val: CampaignInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const track = (k: keyof CampaignInput["tracking"], val: string) => setV((s) => ({ ...s, tracking: { ...s.tracking, [k]: val } }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { ...v, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) };
    if (initial.id) run(() => updateCampaign(workspaceId, initial.id!, input), (r) => { if (!r.error) onDone?.(); });
    else run(() => createCampaign(workspaceId, input), (r) => { if (!r.error && r.id) { onDone?.(); router.push(workspacePath(workspaceId, `campaigns/${r.id}`)); } });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Field label="Campaign name"><input className="input input-sm" required value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Summer Collection Launch" /></Field>
        <Field label="Objective"><select className="select select-sm" value={v.objective} onChange={(e) => set("objective", e.target.value)}>{(Object.keys(OBJECTIVE_LABEL) as (keyof typeof OBJECTIVE_LABEL)[]).map((o) => (<option key={o} value={o}>{OBJECTIVE_LABEL[o]}</option>))}</select></Field>
      </div>
      <Field label="Description"><textarea className="textarea textarea-sm" rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="What this campaign is for and how success is measured." /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Start"><input type="datetime-local" className="input input-sm" value={v.startAt} onChange={(e) => set("startAt", e.target.value)} /></Field>
        <Field label="End"><input type="datetime-local" className="input input-sm" value={v.endAt} onChange={(e) => set("endAt", e.target.value)} /></Field>
        <Field label="Owner"><select className="select select-sm" value={v.ownerUserId} onChange={(e) => set("ownerUserId", e.target.value)}><option value="">Unassigned</option>{members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}</select></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_2fr]">
        <Field label="Planned budget (optional)"><input type="number" min={0} step="0.01" className="input input-sm" value={v.budgetAmount} onChange={(e) => set("budgetAmount", e.target.value)} placeholder="5000" /></Field>
        <Field label="Currency"><input className="input input-sm w-20 uppercase" maxLength={3} value={v.currency} onChange={(e) => set("currency", e.target.value)} /></Field>
        <Field label="Tags (comma-separated)"><input className="input input-sm" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="summer, launch" /></Field>
      </div>
      <fieldset className="grid gap-3 rounded-field border border-base-300 p-3 sm:grid-cols-4">
        <legend className="px-1 text-xs font-medium text-secondary">Tracking (applied to promoted links)</legend>
        <Field label="utm_source"><input className="input input-xs" value={v.tracking.utmSource ?? ""} onChange={(e) => track("utmSource", e.target.value)} placeholder="social" /></Field>
        <Field label="utm_medium"><input className="input input-xs" value={v.tracking.utmMedium ?? ""} onChange={(e) => track("utmMedium", e.target.value)} placeholder="paid" /></Field>
        <Field label="utm_campaign"><input className="input input-xs" value={v.tracking.utmCampaign ?? ""} onChange={(e) => track("utmCampaign", e.target.value)} placeholder="summer-2026" /></Field>
        <Field label="Link template"><input className="input input-xs" value={v.tracking.linkTemplate ?? ""} onChange={(e) => track("linkTemplate", e.target.value)} placeholder="https://example.com/?utm_campaign={campaign}" /></Field>
      </fieldset>
      <p className="text-xs text-secondary/70">Spend and results are imported from connected ad accounts; the planned budget only caps promotions started from here.</p>
      <div className="flex gap-2"><Button type="submit" color="primary" size="sm" loading={pending}>{initial.id ? "Save changes" : "Create campaign"}</Button>{onDone && <Button type="button" variant="ghost" color="neutral" size="sm" onClick={onDone}>Cancel</Button>}</div>
    </form>
  );
}
