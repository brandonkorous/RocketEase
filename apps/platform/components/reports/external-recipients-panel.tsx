"use client";

import { useState } from "react";
import { Badge, Button } from "@wizeworks/silicaui-react";
import { inviteExternalRecipient, removeExternalRecipient, type ExternalRecipientRow } from "@/lib/actions/report-recipients";
import { useActionFeedback } from "@/lib/use-action-feedback";
import { ConfirmDialog } from "../confirm-dialog";

const TONE: Record<string, "success" | "warning" | "neutral"> = { verified: "success", pending: "warning", unsubscribed: "neutral" };
const LABEL: Record<string, string> = { verified: "Confirmed", pending: "Awaiting confirmation", unsubscribed: "Unsubscribed" };

/**
 * Addresses outside the workspace that may receive client reports. Adding one
 * only sends an opt-in email — nothing is delivered until the recipient
 * confirms, and an unconfirmed address is skipped at every run.
 */
export function ExternalRecipientsPanel({ workspaceId, rows, canManage }: { workspaceId: string; rows: ExternalRecipientRow[]; canManage: boolean }) {
  const { run, pending } = useActionFeedback();
  const [email, setEmail] = useState("");

  return (
    <section className="rounded-box border border-base-300 p-4" aria-label="External report recipients">
      <h2 className="text-sm font-semibold">External recipients</h2>
      <p className="mt-1 max-w-160 text-xs text-secondary/70">People outside this workspace who can receive client-facing reports. Each one confirms by email first; until then they stay pending and are skipped.</p>

      {canManage && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => inviteExternalRecipient(workspaceId, email), (r) => { if (!r.error) setEmail(""); });
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-secondary">Email address</span>
            <input className="input input-sm w-70" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@theircompany.com" />
          </label>
          <Button type="submit" size="sm" variant="outline" color="neutral" loading={pending}>Send opt-in</Button>
        </form>
      )}

      <ul className="mt-3 flex flex-col divide-y divide-base-300 border-t border-base-300">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate">{r.email}</span>
            <span className="flex shrink-0 items-center gap-2">
              <Badge size="xs" variant="soft" color={TONE[r.status] ?? "neutral"}>{LABEL[r.status] ?? r.status}</Badge>
              {canManage && (
                <ConfirmDialog
                  trigger={<Button size="xs" variant="ghost" color="error" disabled={pending}>Remove</Button>}
                  title={`Remove ${r.email}?`}
                  description="They stop receiving reports immediately. Adding them again requires a fresh opt-in."
                  confirmLabel="Remove"
                  onConfirm={() => run(() => removeExternalRecipient(workspaceId, r.id))}
                />
              )}
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="py-4 text-center text-xs text-secondary/70">No external recipients yet.</li>}
      </ul>
    </section>
  );
}
