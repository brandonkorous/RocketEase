"use client";

import { Button } from "@wizeworks/silicaui-react";
import type { IntegrationRow } from "@/lib/accounts/types";

const CONSEQUENCES: Record<IntegrationRow["group"], string[]> = {
  social: [
    "Scheduled posts to this account will fail until it is reconnected.",
    "Inbox sync and analytics for it stop now.",
    "We revoke our access at the network and delete the stored token.",
    "Past posts, conversations, and reports are kept.",
  ],
  ads: ["Paid results stop importing for this account.", "Promotions can no longer be created against it.", "Imported spend and results already stored are kept."],
  analytics: ["Conversions and revenue from this source stop importing.", "Metrics that depend on it show as unavailable with the reason, never as zero.", "Facts already imported are kept."],
};

type Props = { row: IntegrationRow; pending: boolean; onCancel: () => void; onConfirm: () => void };

export function DisconnectDialog({ row, pending, onCancel, onConfirm }: Props) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="dc-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-110 rounded-box border border-base-300 bg-base-100 p-6">
        <h3 id="dc-title" className="text-lg font-bold">Disconnect {row.name}?</h3>
        <ul className="mt-3 list-disc pl-5 text-sm leading-relaxed text-secondary">
          {CONSEQUENCES[row.group].map((c) => (<li key={c}>{c}</li>))}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" color="neutral" onClick={onCancel}>Keep connected</Button>
          <Button color="error" loading={pending} onClick={onConfirm}>Disconnect</Button>
        </div>
      </div>
    </div>
  );
}
