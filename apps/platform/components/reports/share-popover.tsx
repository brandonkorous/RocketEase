"use client";

import { useState } from "react";
import { Button, Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@wizeworks/silicaui-react";
import { createReportShare, listReportShares, revokeReportShare } from "@/lib/actions/report-shares";
import { DEFAULT_SHARE_DAYS } from "@/lib/reports/share-config";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { ShareForm } from "./share-form";
import { ShareList, type ShareRow } from "./share-list";

/**
 * Client link for one generated report. The URL is shown once here and carries
 * no workspace or organization id; revoking it cuts access off immediately.
 */
export function SharePopover({ workspaceId, runId, runName }: { workspaceId: string; runId: string; runName: string }) {
  const { notify, run, pending } = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(DEFAULT_SHARE_DAYS);
  const [passcode, setPasscode] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [shares, setShares] = useState<ShareRow[] | null>(null);

  const load = async () => setShares(await listReportShares(workspaceId, runId).catch(() => []));

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) void load();
    else setCreated(null);
  }

  async function create() {
    setBusy(true);
    const res = await createReportShare(workspaceId, { runId, days, passcode });
    setBusy(false);
    notify(res);
    if (!res.url) return;
    setCreated(res.url);
    setPasscode("");
    await load();
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger>
        <Button size="xs" variant="ghost" color="neutral">Share</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-3">
        <PopoverTitle className="text-sm font-semibold">Share &ldquo;{runName}&rdquo;</PopoverTitle>
        <p className="mt-1 text-xs text-secondary/70">Anyone with the link can open the report. It shows no workspace name or id, and stops working on the expiry date.</p>
        <ShareForm
          days={days}
          setDays={setDays}
          passcode={passcode}
          setPasscode={setPasscode}
          busy={busy}
          onCreate={() => void create()}
          created={created}
          onCopy={(url) => void navigator.clipboard.writeText(url).then(() => notify({ ok: "Link copied." }))}
        />
        <ShareList shares={shares} onRevoke={(id) => run(() => revokeReportShare(workspaceId, id), () => void load())} pending={pending} />
      </PopoverContent>
    </Popover>
  );
}
