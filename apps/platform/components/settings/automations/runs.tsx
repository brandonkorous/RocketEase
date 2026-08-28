"use client";

import { Badge } from "@wizeworks/silicaui-react";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/automations/labels";
import type { RunRow } from "@/lib/automations/queries";
import type { DryRunHit } from "@/lib/actions/automations/dry-run";

/** Run history for one rule: when it fired, why it matched, and what it did. */
export function RunHistory({ runs }: { runs: RunRow[] }) {
  if (runs.length === 0) return <p className="mt-2 text-sm text-secondary/70">This rule has not matched anything yet.</p>;
  return (
    <table className="mt-2 w-full text-sm">
      <thead className="text-xs text-secondary">
        <tr>
          <th className="pb-2 text-left font-medium">When</th>
          <th className="pb-2 text-left font-medium">Result</th>
          <th className="pb-2 text-left font-medium">Why it matched</th>
          <th className="pb-2 text-left font-medium">What happened</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-base-300 align-top">
        {runs.map((r) => (
          <tr key={r.id}>
            <td className="py-2 pr-3 whitespace-nowrap text-xs text-secondary/70">{r.at}</td>
            <td className="py-2 pr-3">
              <Badge size="xs" variant="soft" color={STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]}</Badge>
            </td>
            <td className="max-w-100 py-2 pr-3 text-secondary">{r.explanation}</td>
            <td className="py-2 text-secondary">
              {r.outcomes.length ? (
                <ul className="flex flex-col gap-0.5">
                  {r.outcomes.map((o, i) => (
                    <li key={`${r.id}-${i}`} className={o.status === "failed" ? "text-error" : undefined}>
                      {o.kind}: {o.detail}
                    </li>
                  ))}
                </ul>
              ) : (
                (r.reason ?? "—")
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Dry-run preview. Nothing here was applied. */
export function DryRunPanel({ hits, onClose }: { hits: DryRunHit[]; onClose: () => void }) {
  const matched = hits.filter((h) => h.matched);
  return (
    <div className="mt-3 rounded-box border border-base-300 p-3">
      <div className="flex items-center justify-between">
        <h5 className="text-sm font-semibold">Test result — {matched.length} of {hits.length} would have matched</h5>
        <button type="button" className="text-xs text-secondary hover:underline" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-xs text-secondary/70">Nothing was changed. This is what the rule would have done to recent items.</p>
      <ul className="mt-2 flex max-h-80 flex-col divide-y divide-base-300 overflow-y-auto text-sm">
        {hits.map((h) => (
          <li key={h.refId} className="flex flex-col gap-0.5 py-2">
            <span className="flex items-center gap-2">
              <Badge size="xs" variant="soft" color={h.matched ? "success" : "neutral"}>{h.matched ? "Would run" : "No match"}</Badge>
              <span className="truncate font-medium">{h.label}</span>
            </span>
            <span className="text-xs text-secondary">{h.explanation}</span>
          </li>
        ))}
        {hits.length === 0 && <li className="py-4 text-center text-xs text-secondary/70">No recent items of this kind to test against.</li>}
      </ul>
    </div>
  );
}
