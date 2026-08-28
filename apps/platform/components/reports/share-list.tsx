"use client";

import { Button } from "@wizeworks/silicaui-react";

export type ShareRow = { id: string; expiresAt: string; revokedAt: string | null; viewCount: number; lastViewedAt: string | null; hasPasscode: boolean };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function state(s: ShareRow): { label: string; live: boolean } {
  if (s.revokedAt) return { label: `Revoked ${day(s.revokedAt)}`, live: false };
  if (Date.parse(s.expiresAt) <= Date.now()) return { label: `Expired ${day(s.expiresAt)}`, live: false };
  return { label: `Active until ${day(s.expiresAt)}`, live: true };
}

/** Existing links for one run, with their view counts — the record of who still has access. */
export function ShareList({ shares, onRevoke, pending }: { shares: ShareRow[] | null; onRevoke: (id: string) => void; pending: boolean }) {
  if (shares === null) return <p className="mt-3 text-xs text-secondary/70">Loading links…</p>;
  if (shares.length === 0) return <p className="mt-3 text-xs text-secondary/70">No links yet for this report.</p>;
  return (
    <ul className="mt-3 flex flex-col divide-y divide-base-300 border-t border-base-300">
      {shares.map((s) => {
        const st = state(s);
        return (
          <li key={s.id} className="flex items-center justify-between gap-2 py-2">
            <span className="min-w-0 text-xs">
              <span className={st.live ? "font-medium" : "text-secondary"}>{st.label}</span>
              {s.hasPasscode && <span className="text-secondary/70"> · passcode</span>}
              <br />
              <span className="text-secondary/70">
                {s.viewCount} view{s.viewCount === 1 ? "" : "s"}
                {s.lastViewedAt ? ` · last ${day(s.lastViewedAt)}` : ""}
              </span>
            </span>
            {st.live && (
              <Button size="xs" variant="ghost" color="error" disabled={pending} onClick={() => onRevoke(s.id)}>
                Revoke
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
