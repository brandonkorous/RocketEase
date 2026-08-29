"use client";

import { Tooltip } from "@wizeworks/silicaui-react";
import type { MetricContract } from "@/lib/analytics/metrics";
import { DEFINITIONS_VERSION, formatMetric } from "@/lib/analytics/metrics";
import type { ScoreCard } from "@/lib/analytics/screen";
import { breakLabel } from "@/lib/analytics/breaks";

/** Every metric carries its contract (ANA-002): definition, formula, freshness, caveats. */
export function MetricInfo({ m, freshness }: { m: MetricContract; freshness: string | null }) {
  const content = (
    <div className="max-w-70 text-left text-xs leading-relaxed">
      <div className="font-semibold">{m.name}</div>
      <p>{m.definition}</p>
      <p className="mt-1 text-secondary">Formula: {m.formula}</p>
      <p className="text-secondary">Sources: {Object.values(m.providers).join(", ") || "none connected"}</p>
      <p className="text-secondary">Freshness: expected within {m.freshnessHours}h · last update {freshness ?? "never"}</p>
      {m.caveat && <p className="mt-1 text-warning">{m.caveat}</p>}
      {m.breaks?.map((b) => (<p key={b.effectiveFrom + b.provider} className="mt-1 text-secondary">{breakLabel(b)} on {b.effectiveFrom}: {b.previous.name} → {b.next.name}. Series are split here, never joined.</p>))}
      <p className="mt-1 text-secondary/70">Definitions v{DEFINITIONS_VERSION}</p>
    </div>
  );
  return (
    <Tooltip content={content} delay={150}>
      <button type="button" className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-base-300 text-xs text-secondary hover:bg-base-200" aria-label={`About ${m.name}`}>i</button>
    </Tooltip>
  );
}

export function Scorecards({ cards, compareLabel, freshness }: { cards: ScoreCard[]; compareLabel: string | null; freshness: string | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {cards.map((c) => (
        <div key={c.contract.key} className="rounded-box border border-base-300 p-4">
          <div className="flex items-center text-sm text-secondary">{c.contract.name}<MetricInfo m={c.contract} freshness={freshness} /></div>
          {c.unavailable ? (
            <>
              <div className="mt-1 text-2xl font-bold tracking-tight text-secondary/50">—</div>
              <p className="mt-1 text-xs text-secondary/70">Unavailable · {c.unavailable}</p>
            </>
          ) : (
            <>
              <div className="mt-1 text-2xl font-bold tracking-tight">{formatMetric(c.contract, c.value)}</div>
              {c.delta && compareLabel ? (
                <p className="mt-1 text-xs"><span className={c.delta.pct === null ? "text-secondary" : c.delta.abs >= 0 ? "text-success" : "text-error"}>{c.delta.label}</span><span className="text-secondary/70"> vs {compareLabel}</span></p>
              ) : (
                <p className="mt-1 text-xs text-secondary/70">{compareLabel ? `No data for ${compareLabel}` : "No comparison"}</p>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
