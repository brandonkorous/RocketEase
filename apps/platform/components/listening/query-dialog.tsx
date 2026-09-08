"use client";

import { useState } from "react";
import { Button, Checkbox, Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, Input, Label, Textarea } from "@wizeworks/silicaui-react";
import { saveListeningQuery } from "@/lib/actions/listening";
import { LISTENING_COVERAGE, LISTENING_NETWORKS, type ListeningNetwork } from "@/lib/listening/coverage";
import type { QueryRow } from "@/lib/listening/screen";
import { useActionFeedback } from "@/lib/use-action-feedback";

type Props = { workspaceId: string; networkState: Record<ListeningNetwork, string>; initial?: QueryRow };

/** Name, terms, networks. Each network line says how it is reached here, so an unreachable one is not a surprise later. */
export function QueryDialog({ workspaceId, networkState, initial }: Props) {
  const { run, pending } = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [terms, setTerms] = useState(initial?.terms.join(", ") ?? "");
  const [networks, setNetworks] = useState<ListeningNetwork[]>(initial?.networks ?? ["bluesky"]);
  const toggle = (n: ListeningNetwork) => setNetworks((xs) => (xs.includes(n) ? xs.filter((x) => x !== n) : [...xs, n]));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => saveListeningQuery(workspaceId, { id: initial?.id, name, terms, networks }), (r) => { if (!r.error) setOpen(false); });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {initial ? <Button size="xs" variant="ghost" color="neutral" onClick={() => setOpen(true)}>Edit</Button> : <Button color="primary" onClick={() => setOpen(true)}>New query</Button>}
      <DialogContent className="max-w-130">
        <DialogTitle>{initial ? `Edit “${initial.name}”` : "New listening query"}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-secondary">Words or “quoted phrases”, one per comma. Each term is searched on its own; a post that matches any of them is a hit.</DialogDescription>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5"><Label htmlFor="lq-name">Name</Label><Input id="lq-name" size="sm" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Northwind, or Competitor: Brew Bros" required /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="lq-terms">Terms</Label><Textarea id="lq-terms" rows={3} className="w-full text-sm" maxLength={2000} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder='northwind, "northwind coffee", #northwindroast' required /><span className="text-xs text-secondary/70">Up to 10 terms, 80 characters each.</span></div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Networks</legend>
            {LISTENING_NETWORKS.map((n) => (
              <label key={n} className="flex items-start gap-2 text-sm">
                <Checkbox checked={networks.includes(n)} onChange={() => toggle(n)} />
                <span className="flex flex-col"><span>{LISTENING_COVERAGE[n].label}</span><span className="text-xs text-secondary/70">{networkState[n]}</span></span>
              </label>
            ))}
          </fieldset>
          <div className="flex justify-end gap-2">
            <DialogClose><Button type="button" variant="ghost" color="neutral">Cancel</Button></DialogClose>
            <Button type="submit" size="sm" color="primary" loading={pending} disabled={!name.trim() || !terms.trim() || networks.length === 0}>{initial ? "Save query" : "Create query"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
