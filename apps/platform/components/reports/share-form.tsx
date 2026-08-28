"use client";

import { Button } from "@wizeworks/silicaui-react";
import { DEFAULT_SHARE_DAYS } from "@/lib/reports/share-config";

type Props = {
  days: number;
  setDays: (d: number) => void;
  passcode: string;
  setPasscode: (p: string) => void;
  busy: boolean;
  onCreate: () => void;
  created: string | null;
  onCopy: (url: string) => void;
};

const OPTIONS = [7, 14, 30, DEFAULT_SHARE_DAYS, 60, 90, 180].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);

/** Expiry, optional passcode, and the one-time display of the minted link. */
export function ShareForm({ days, setDays, passcode, setPasscode, busy, onCreate, created, onCopy }: Props) {
  return (
    <>
      <div className="mt-3 flex items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-secondary">Expires in</span>
          <select className="select select-xs w-24" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {OPTIONS.map((d) => (<option key={d} value={d}>{d} days</option>))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs">
          <span className="font-medium text-secondary">Passcode (optional)</span>
          <input className="input input-xs" value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="At least 4 characters" />
        </label>
        <Button size="xs" color="primary" loading={busy} onClick={onCreate}>Create link</Button>
      </div>
      {created && (
        <div className="mt-3 rounded-field border border-base-300 p-2">
          <p className="text-xs font-medium">Copy this link now — it is not shown again.</p>
          <div className="mt-1 flex gap-2">
            <input readOnly className="input input-xs flex-1 font-mono" value={created} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
            <Button size="xs" variant="outline" color="neutral" onClick={() => onCopy(created)}>Copy</Button>
          </div>
        </div>
      )}
    </>
  );
}
