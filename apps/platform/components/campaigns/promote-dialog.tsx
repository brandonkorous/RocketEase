"use client";

import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, Button } from "@wizeworks/silicaui-react";
import { promoteVariant, type PromoteInput } from "@/lib/actions/campaigns";
import type { EligiblePost } from "@/lib/campaigns/ads";
import type { CampaignDetailData } from "@/lib/campaigns/detail";
import { OBJECTIVE_LABEL, formatMoney } from "@/lib/campaigns/format";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { NetMark } from "../net-mark";

type Draft = Omit<PromoteInput, "confirmed" | "variantId" | "campaignId">;
const OBJECTIVES = ["engagement", "traffic", "awareness", "leads", "conversions"] as const;

function Summary({ post, d, data }: { post: EligiblePost; d: Draft; data: CampaignDetailData }) {
  const account = post.accounts.find((a) => a.id === d.adAccountId);
  const t = data.campaign.tracking;
  const tracking = [t.utmSource && `utm_source=${t.utmSource}`, t.utmMedium && `utm_medium=${t.utmMedium}`, t.utmCampaign && `utm_campaign=${t.utmCampaign}`].filter(Boolean).join("&");
  return (
    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      <dt className="text-secondary">Source post</dt><dd className="min-w-0"><span className="flex items-center gap-1.5"><NetMark network={post.channel.network} size={14} /><span className="truncate">{post.title}</span></span><span className="block truncate text-xs text-secondary/70">{post.text}</span></dd>
      <dt className="text-secondary">Destination</dt><dd>{account?.name ?? "—"} · {post.channel.name}</dd>
      <dt className="text-secondary">Objective</dt><dd>{OBJECTIVE_LABEL[d.objective]}</dd>
      <dt className="text-secondary">Budget</dt><dd className="font-semibold">{formatMoney(Number(d.amount) || 0, account?.currency ?? "USD")} {d.budgetKind === "daily" ? "per day" : "lifetime"}</dd>
      <dt className="text-secondary">Dates</dt><dd>{d.startAt ? d.startAt.replace("T", " ") : "Starts immediately"} → {d.endAt ? d.endAt.replace("T", " ") : "no end date"}</dd>
      <dt className="text-secondary">Audience</dt><dd>{d.countries.trim() || "Automatic (provider default)"}</dd>
      <dt className="text-secondary">Tracking</dt><dd className="break-all text-xs">{tracking || "No UTM parameters on this campaign"}</dd>
      <dt className="text-secondary">Initial state</dt><dd>{d.initialStatus === "active" ? "Live immediately — spend starts right away" : "Paused — no spend until you switch it on in the ad account"}</dd>
      <dt className="text-secondary">Policy</dt><dd className="text-xs text-secondary">{data.campaign.budgetAmount !== null ? `Capped by the campaign's remaining planned budget (${formatMoney(data.budget.remaining, data.campaign.currency)}).` : "No campaign budget cap set."} This action is audited under your name.</dd>
    </dl>
  );
}

/** Promote-a-post (CAM-002, flows.md steps 4–6): set up, review the summary, confirm explicitly. Never spends before confirmation. */
export function PromoteDialog({ post, data, onClose }: { post: EligiblePost; data: CampaignDetailData; onClose: () => void }) {
  const { run, pending } = useActionFeedback();
  const [d, setD] = useState<Draft>({ adAccountId: post.accounts[0]?.id ?? "", name: `${post.title} · boost`, objective: data.campaign.objective, budgetKind: "daily", amount: 20, startAt: "", endAt: "", countries: "", initialStatus: "paused" });
  const [review, setReview] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));
  const confirm = () => run(() => promoteVariant(data.workspaceId, { ...d, amount: Number(d.amount), variantId: post.variantId, campaignId: data.campaign.id, confirmed: true }), (r) => { if (!r.error) onClose(); });
  return (
    <section className="rounded-box border border-base-300 p-4" aria-label="Promote post">
      <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">Promote “{post.title}”</h3><Button size="xs" variant="ghost" color="neutral" onClick={onClose}>Close</Button></div>
      <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setReview(true); }}>
        <label className="flex flex-col gap-1 text-sm"><span className="text-xs font-medium text-secondary">Ad account</span><select className="select select-sm" value={d.adAccountId} onChange={(e) => set("adAccountId", e.target.value)} required>{post.accounts.map((a) => (<option key={a.id} value={a.id}>{a.name} ({a.currency})</option>))}</select></label>
        <label className="flex flex-col gap-1 text-sm"><span className="text-xs font-medium text-secondary">Name</span><input className="input input-sm" value={d.name} onChange={(e) => set("name", e.target.value)} required /></label>
        <label className="flex flex-col gap-1 text-sm"><span className="text-xs font-medium text-secondary">Objective</span><select className="select select-sm" value={d.objective} onChange={(e) => set("objective", e.target.value as Draft["objective"])}>{OBJECTIVES.map((o) => (<option key={o} value={o}>{OBJECTIVE_LABEL[o]}</option>))}</select></label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="flex flex-col gap-1 text-sm"><span className="text-xs font-medium text-secondary">Budget</span><input type="number" min={1} step="0.01" className="input input-sm" value={d.amount} onChange={(e) => set("amount", Number(e.target.value))} required /></label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-xs font-medium text-secondary">Kind</span><select className="select select-sm" value={d.budgetKind} onChange={(e) => set("budgetKind", e.target.value as Draft["budgetKind"])}><option value="daily">Per day</option><option value="lifetime">Lifetime</option></select></label>
        </div>
        <label className="flex flex-col gap-1 text-sm"><span className="text-xs font-medium text-secondary">Start (blank = now)</span><input type="datetime-local" className="input input-sm" value={d.startAt} onChange={(e) => set("startAt", e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm"><span className="text-xs font-medium text-secondary">End{d.budgetKind === "lifetime" ? " (required)" : ""}</span><input type="datetime-local" className="input input-sm" value={d.endAt} onChange={(e) => set("endAt", e.target.value)} required={d.budgetKind === "lifetime"} /></label>
        <label className="flex flex-col gap-1 text-sm"><span className="text-xs font-medium text-secondary">Countries (ISO codes, blank = provider default)</span><input className="input input-sm" value={d.countries} onChange={(e) => set("countries", e.target.value)} placeholder="US, CA" /></label>
        <label className="flex flex-col gap-1 text-sm"><span className="text-xs font-medium text-secondary">After creation</span><select className="select select-sm" value={d.initialStatus} onChange={(e) => set("initialStatus", e.target.value as Draft["initialStatus"])}><option value="paused">Create paused (recommended)</option><option value="active">Go live immediately</option></select></label>
        <div className="sm:col-span-2 flex items-center gap-2"><Button type="submit" size="sm" color="primary" disabled={!d.adAccountId}>Review &amp; confirm</Button><span className="text-xs text-secondary/70">Nothing is created or spent until you confirm the summary.</span></div>
      </form>
      <AlertDialog open={review} onOpenChange={setReview}>
        <AlertDialogContent>
          <AlertDialogTitle>Confirm promotion{d.initialStatus === "active" ? " and start spending" : ""}</AlertDialogTitle>
          <AlertDialogDescription>Check the summary. Confirming creates the campaign, ad set and ad in the ad account under your name.</AlertDialogDescription>
          <Summary post={post} d={d} data={data} />
          <div className="mt-4 flex justify-end gap-2"><AlertDialogCancel><Button variant="ghost" color="neutral" size="sm">Back</Button></AlertDialogCancel><AlertDialogAction color="primary" size="sm" loading={pending} onClick={confirm}>{d.initialStatus === "active" ? "Confirm and go live" : "Confirm (paused)"}</AlertDialogAction></div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
