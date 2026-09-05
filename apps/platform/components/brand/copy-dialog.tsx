"use client";

import { useState } from "react";
import { Button, Checkbox, Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, Label } from "@wizeworks/silicaui-react";
import { copyBrandKit } from "@/lib/actions/brand/copy";
import { COPYABLE } from "@/lib/brand/copy";
import type { BrandSection } from "@/lib/brand/schema";
import { BRAND_SECTIONS } from "@/lib/brand/sections";
import { useActionFeedback } from "@/lib/use-action-feedback";

export type CopySource = { id: string; name: string; organizationName: string };

/** Replace sections of this kit with another workspace's. Logo files are copied; library assets stay where they are. */
export function CopyBrandDialog({ workspaceId, sources }: { workspaceId: string; sources: CopySource[] }) {
  const { run, pending } = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState(sources[0]?.id ?? "");
  const [sections, setSections] = useState<BrandSection[]>(COPYABLE);
  const toggle = (s: BrandSection) => setSections((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => copyBrandKit({ workspaceId, sourceWorkspaceId: source, sections }), (r) => { if (!r.error) setOpen(false); });
  };
  const count = sections.length === 1 ? "1 section" : `${sections.length} sections`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" color="neutral" onClick={() => setOpen(true)}>Copy from another workspace</Button>
      <DialogContent className="max-w-130">
        <DialogTitle>Copy a brand kit</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-secondary">The sections you tick are replaced here with the other workspace&rsquo;s. Logo files are copied. Library assets stay in their own workspace; only external media links come across.</DialogDescription>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="copy-src">Copy from</Label>
            <select id="copy-src" className="select select-sm w-full" value={source} onChange={(e) => setSource(e.target.value)}>
              {sources.map((s) => (<option key={s.id} value={s.id}>{s.name} · {s.organizationName}</option>))}
            </select>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Sections to replace</legend>
            {BRAND_SECTIONS.map((s) => (
              <label key={s.slug} className="flex items-start gap-2 text-sm">
                <Checkbox className="mt-0.5" checked={sections.includes(s.slug)} onChange={() => toggle(s.slug)} aria-label={s.label} />
                <span><span className="font-medium">{s.label}</span><span className="block text-xs text-secondary">{s.slug === "assets" ? "External media links only. Library assets stay in their workspace." : s.blurb}</span></span>
              </label>
            ))}
          </fieldset>
          <div className="flex justify-end gap-2">
            <DialogClose><Button variant="ghost" color="neutral">Cancel</Button></DialogClose>
            <Button type="submit" color="primary" loading={pending} disabled={!source || sections.length === 0}>Replace {count}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
