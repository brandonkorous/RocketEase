"use client";

import type { ReportInput } from "@/lib/actions/reports";
import type { ExternalRecipientRow } from "@/lib/actions/report-recipients";

type SetField = <K extends keyof ReportInput>(k: K, val: ReportInput[K]) => void;
type Props = { v: ReportInput; set: SetField; recipients: string; setRecipients: (v: string) => void; external: ExternalRecipientRow[] };

/**
 * External addresses can only be ticked once they have confirmed the opt-in —
 * an unconfirmed address is shown but never delivered to.
 */
function ExternalPicker({ v, set, external }: { v: ReportInput; set: SetField; external: ExternalRecipientRow[] }) {
  const verified = external.filter((r) => r.status === "verified");
  const pending = external.filter((r) => r.status !== "verified");
  const toggle = (email: string, on: boolean) => set("externalRecipients", on ? [...v.externalRecipients, email] : v.externalRecipients.filter((e) => e !== email));
  return (
    <fieldset className="flex flex-col gap-2 rounded-field border border-base-300 p-3">
      <legend className="px-1 text-xs font-medium text-secondary">External recipients</legend>
      {verified.length === 0 && pending.length === 0 && <p className="text-xs text-secondary/70">No external addresses yet. Invite one below; nothing is sent until they confirm.</p>}
      {verified.map((r) => (
        <label key={r.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="checkbox checkbox-sm" checked={v.externalRecipients.includes(r.email)} onChange={(e) => toggle(r.email, e.target.checked)} />
          {r.email}
        </label>
      ))}
      {pending.map((r) => (
        <p key={r.id} className="text-xs text-secondary/70">
          {r.email} — {r.status === "unsubscribed" ? "unsubscribed" : "waiting for confirmation"}; skipped at every run until confirmed.
        </p>
      ))}
    </fieldset>
  );
}

function FormatRow({ v, set, recipients, setRecipients }: Omit<Props, "external">) {
  const pickFormat = (format: ReportInput["format"]) => {
    set("format", format);
    if (format === "csv") {
      set("clientFacing", false);
      set("externalRecipients", []);
    }
  };
  return (
    <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr]">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-secondary">Format</span>
        <select className="select select-sm" value={v.format} onChange={(e) => pickFormat(e.target.value as ReportInput["format"])}>
          <option value="csv">CSV export (analysts)</option>
          <option value="html">Branded document (clients)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-secondary">Schedule</span>
        <select className="select select-sm" value={v.cadence} onChange={(e) => set("cadence", e.target.value as ReportInput["cadence"])}>
          <option value="none">Manual only</option>
          <option value="daily">Daily, 8:00</option>
          <option value="weekly">Weekly, Monday 8:00</option>
          <option value="monthly">Monthly, 1st 8:00</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-secondary">Workspace members (comma-separated)</span>
        <input className="input input-sm" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="name@company.com" />
      </label>
    </div>
  );
}

/** Delivery half of the report form: format, schedule, and who receives it. */
export function ReportDelivery({ v, set, recipients, setRecipients, external }: Props) {
  return (
    <>
      <FormatRow v={v} set={set} recipients={recipients} setRecipients={setRecipients} />
      {v.format === "html" && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="checkbox checkbox-sm mt-0.5" checked={v.clientFacing} onChange={(e) => { set("clientFacing", e.target.checked); if (!e.target.checked) set("externalRecipients", []); }} />
          <span>
            Client-facing
            <span className="block text-xs text-secondary/70">Sends the branded document through a revocable link instead of a raw file, and allows confirmed external addresses.</span>
          </span>
        </label>
      )}
      {v.clientFacing && <ExternalPicker v={v} set={set} external={external} />}
    </>
  );
}
