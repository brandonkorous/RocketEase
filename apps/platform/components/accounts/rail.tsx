"use client";

import Link from "next/link";
import { Button } from "@wizeworks/silicaui-react";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import type { AccountsData, ExpiringRow, PendingRow, RecommendedRow } from "@/lib/accounts/types";
import { NetMark } from "../net-mark";

const CARD = "rounded-box border border-base-300 p-4";

type Props = { data: AccountsData; pending: boolean; onDiscard: (row: PendingRow) => void; onShowTone: (tone: string) => void };

export function AccountsRail({ data, pending, onDiscard, onShowTone }: Props) {
  return (
    <aside className="flex flex-col gap-4" aria-label="Connection health">
      <Summary data={data} onShowTone={onShowTone} />
      {data.expiring.length > 0 && <Expiring rows={data.expiring} />}
      {data.recommended.length > 0 && <Recommended rows={data.recommended} canManage={data.canManage} />}
      {data.canManage && data.pending.map((p) => (<InProgress key={p.id} row={p} pending={pending} onDiscard={onDiscard} />))}
    </aside>
  );
}

function Summary({ data, onShowTone }: { data: AccountsData; onShowTone: (tone: string) => void }) {
  const { summary } = data;
  const lines: { tone: string; label: string; n: number; dot: string }[] = [
    { tone: "success", label: "Healthy", n: summary.healthy, dot: "bg-success" },
    { tone: "warning", label: "Warnings", n: summary.warnings, dot: "bg-warning" },
    { tone: "error", label: "Errors", n: summary.errors, dot: "bg-error" },
  ];
  return (
    <section className={CARD} aria-labelledby="summary-h">
      <h2 id="summary-h" className="text-sm font-semibold">Connection summary</h2>
      <dl className="mt-3 flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between"><dt className="text-secondary">Total accounts</dt><dd className="font-semibold">{summary.total}</dd></div>
        {lines.map((l) => (
          <div key={l.tone} className="flex items-center justify-between">
            <dt><button type="button" onClick={() => onShowTone(l.tone)} className="flex items-center gap-2 text-secondary hover:text-base-content"><span className={`h-2 w-2 rounded-full ${l.dot}`} aria-hidden="true" />{l.label}</button></dt>
            <dd className="font-semibold">{l.n}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-center justify-between border-t border-base-300 pt-3 text-sm">
        <span className="flex items-center gap-2 text-secondary"><ClockIcon />Expiring soon</span>
        <span className="font-semibold">{summary.expiring}</span>
      </div>
    </section>
  );
}

function Expiring({ rows }: { rows: ExpiringRow[] }) {
  return (
    <section className={CARD} aria-labelledby="expiring-h">
      <h2 id="expiring-h" className="text-sm font-semibold">Expiring connections</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-field border border-base-300">{r.network && <NetMark network={r.network} size={16} />}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.title}</span><span className="block truncate text-xs text-secondary/70">{r.note}</span></span>
            {r.action.href && <a href={r.action.href} className={buttonClasses({ size: "xs", variant: r.action.emphasis ? "solid" : "outline", color: r.action.emphasis ? "primary" : "neutral" })}>{r.action.label}</a>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Recommended({ rows, canManage }: { rows: RecommendedRow[]; canManage: boolean }) {
  return (
    <section className={CARD} aria-labelledby="recommended-h">
      <h2 id="recommended-h" className="text-sm font-semibold">Available integrations</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {rows.slice(0, 4).map((r) => (
          <li key={r.key} className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-field border border-base-300">{r.network && <NetMark network={r.network} size={16} />}</span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{r.title}</span><span className="block text-xs leading-relaxed text-secondary/70">{r.blurb}</span></span>
            {canManage && r.href && <a href={r.href} className={`${buttonClasses({ size: "xs", variant: "outline", color: "neutral" })} shrink-0`}>Connect</a>}
          </li>
        ))}
      </ul>
      <Link href="/capabilities" target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-medium hover:underline">What each network supports →</Link>
    </section>
  );
}

/** A sign-in that came back without accounts chosen — the connect flow is half done. */
function InProgress({ row, pending, onDiscard }: { row: PendingRow; pending: boolean; onDiscard: (row: PendingRow) => void }) {
  return (
    <section className={CARD} aria-labelledby={`progress-${row.id}`}>
      <h2 id={`progress-${row.id}`} className="text-sm font-semibold">Connection in progress</h2>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-field border border-base-300">{row.network && <NetMark network={row.network} size={16} />}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{row.title}</span><span className="block text-xs leading-relaxed text-secondary/70">{row.note}</span></span>
      </div>
      <div className="mt-3 flex gap-2">
        <Link href={row.selectHref} className={`${buttonClasses({ size: "sm", color: "primary" })} flex-1`}>Choose accounts</Link>
        <Button size="sm" variant="ghost" color="neutral" disabled={pending} onClick={() => onDiscard(row)}>Cancel</Button>
      </div>
    </section>
  );
}

function ClockIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" role="img" aria-label="Expiring soon">
      <circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" strokeLinecap="round" />
    </svg>
  );
}
