"use client";

import { Button, Switch } from "@wizeworks/silicaui-react";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { updateBioPage } from "@/lib/actions/bio/page";
import { displayUrl } from "@/lib/bio/rules";
import { useActionFeedback } from "@/lib/use-action-feedback";

type Props = { workspaceId: string; address: string; live: boolean; canEdit: boolean };

/** Address, copy, open, and the Live switch. Off hides the page; the address stays the workspace's. */
export function StatusCard({ workspaceId, address, live, canEdit }: Props) {
  const { run, pending, toast } = useActionFeedback();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.add({ title: "Link copied.", type: "success" });
    } catch {
      toast.add({ title: "Could not copy. Select the address and copy it yourself.", type: "error" });
    }
  };
  return (
    <section className="flex flex-col gap-3 rounded-box border border-base-300 bg-base-200/60 px-5 py-3.5" aria-label="Your page">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-semibold text-secondary">Your page</span>
          <span className="truncate text-base font-semibold" title={address}>{displayUrl(address)}</span>
        </div>
        <Button size="sm" variant="outline" color="neutral" onClick={copy}>Copy link</Button>
        <a href={address} target="_blank" rel="noopener noreferrer" className={buttonClasses({ size: "sm", variant: "outline", color: "neutral" })}>Open</a>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 border-t border-base-300 pt-3">
        <Switch checked={live} disabled={pending || !canEdit} onCheckedChange={(v: boolean) => run(() => updateBioPage({ workspaceId, live: v }))} aria-label="Page is live" />
        <span className="text-sm font-semibold">{live ? "Live" : "Hidden"}</span>
        <span className="text-sm text-secondary">{live ? "Anyone with the link can open it. Switch off to hide the page; the address stays yours." : "Only you can see it here. Switch on to let anyone with the link open it."}</span>
      </div>
    </section>
  );
}
