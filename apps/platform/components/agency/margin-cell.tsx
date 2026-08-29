"use client";

import { Tooltip } from "@wizeworks/silicaui-react";
import { formatMoney, formatPct, type Money } from "@/lib/agency/margin";

/** An unknown number is an em dash with its reason on hover and focus — never a 0. */
function Unknown({ reason, label }: { reason: string | null; label: string }) {
  const dash = <span className="text-secondary/50">—</span>;
  if (!reason) return dash;
  return (
    <Tooltip content={<span className="block max-w-70 text-xs leading-relaxed">{reason}</span>} delay={150}>
      <span tabIndex={0} className="cursor-help" aria-label={`${label} unavailable: ${reason}`}>{dash}</span>
    </Tooltip>
  );
}

export function MoneyCell({ value, currency, label, strong }: { value: Money; currency: string; label: string; strong?: boolean }) {
  if (value.cents === null) return <Unknown reason={value.reason} label={label} />;
  return <span className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{formatMoney(value.cents, currency)}</span>;
}

export function PctCell({ value, reason }: { value: number | null; reason: string | null }) {
  if (value === null) return <Unknown reason={reason} label="Margin %" />;
  return <span className={`tabular-nums ${value < 0 ? "text-error" : ""}`}>{formatPct(value)}</span>;
}

export function CountCell({ value, reason, label }: { value: number | null; reason: string | null; label: string }) {
  if (value === null) return <Unknown reason={reason} label={label} />;
  return <span className="tabular-nums">{value}</span>;
}
