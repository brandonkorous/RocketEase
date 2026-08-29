"use client";

import { useState } from "react";
import { Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, Input, Label, NativeSelect, Textarea } from "@wizeworks/silicaui-react";
import { BILLING_MODELS, BILLING_MODEL_LABELS, type ClientBillingModel } from "@/lib/agency/margin";
import { setClientRate } from "@/lib/actions/agency/client-rates";
import { useActionFeedback } from "@/lib/use-action-feedback";

export type RateFormValues = {
  billingModel: ClientBillingModel;
  currency: string;
  retainerCents: number;
  perPostCents: number | null;
  hourlyCents: number | null;
  adSpendMarkupBps: number | null;
  aiCreditMarkupBps: number | null;
  note: string;
};

type Props = { organizationId: string; workspaceId: string; clientName: string; initial: RateFormValues | null };
type Setter = <K extends keyof RateFormValues>(k: K, value: RateFormValues[K]) => void;

const EMPTY: RateFormValues = { billingModel: "none", currency: "USD", retainerCents: 0, perPostCents: null, hourlyCents: null, adSpendMarkupBps: null, aiCreditMarkupBps: null, note: "" };

const toAmount = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));
const toCents = (s: string) => (s.trim() === "" ? null : Math.round(Number(s) * 100));
const toPct = (bps: number | null) => (bps == null ? "" : String(bps / 100));
const toBps = (s: string) => (s.trim() === "" ? null : Math.round(Number(s) * 100));

/** What the agency charges this client. Every field is entered — nothing here is inferred from usage. */
export function RateDialog({ organizationId, workspaceId, clientName, initial }: Props) {
  const { run, pending } = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<RateFormValues>(initial ?? EMPTY);
  const set: Setter = (k, value) => setV((p) => ({ ...p, [k]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => setClientRate(organizationId, workspaceId, { ...v, currency: v.currency.toUpperCase() }), (r) => {
      if (!r.error) setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="xs" variant="outline" color="neutral" onClick={() => setOpen(true)}>
        {initial ? "Edit rate" : "Set rate"}
      </Button>
      <DialogContent className="max-w-130">
        <DialogTitle>Rate for {clientName}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-secondary">
          What you invoice this client. RocketEase never guesses a rate — with nothing here, revenue and margin stay unavailable.
        </DialogDescription>
        <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
          <RateFields values={v} set={set} />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <DialogClose><Button type="button" variant="ghost" color="neutral">Cancel</Button></DialogClose>
            <Button type="submit" size="sm" color="primary" loading={pending}>Save rate</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RateFields({ values: v, set }: { values: RateFormValues; set: Setter }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rate-model">Billing model</Label>
        <NativeSelect id="rate-model" size="sm" value={v.billingModel} onChange={(e) => set("billingModel", e.target.value as ClientBillingModel)}>
          {BILLING_MODELS.map((m) => (<option key={m} value={m}>{BILLING_MODEL_LABELS[m]}</option>))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rate-currency">Currency</Label>
        <Input id="rate-currency" size="sm" value={v.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
      </div>
      {v.billingModel === "retainer" && <Amount id="rate-retainer" label="Monthly retainer" value={toAmount(v.retainerCents)} onChange={(s) => set("retainerCents", toCents(s) ?? 0)} />}
      {v.billingModel === "per_post" && <Amount id="rate-post" label="Per published post" value={toAmount(v.perPostCents)} onChange={(s) => set("perPostCents", toCents(s))} />}
      {v.billingModel === "hourly" && <Amount id="rate-hourly" label="Hourly rate" hint="Hours aren't tracked here, so revenue stays unavailable." value={toAmount(v.hourlyCents)} onChange={(s) => set("hourlyCents", toCents(s))} />}
      <Amount id="rate-ads" label="Ad spend markup %" hint="Set only if you buy the media and rebill it." value={toPct(v.adSpendMarkupBps)} onChange={(s) => set("adSpendMarkupBps", toBps(s))} />
      <Amount id="rate-ai" label="AI markup %" hint="Set only if you rebill AI usage." value={toPct(v.aiCreditMarkupBps)} onChange={(s) => set("aiCreditMarkupBps", toBps(s))} />
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="rate-note">Note</Label>
        <Textarea id="rate-note" rows={2} className="w-full text-sm" maxLength={500} value={v.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. renewal in March, media billed separately" />
      </div>
    </>
  );
}

function Amount({ id, label, hint, value, onChange }: { id: string; label: string; hint?: string; value: string; onChange: (s: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} size="sm" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="—" />
      {hint && <span className="text-xs text-secondary/70">{hint}</span>}
    </div>
  );
}
