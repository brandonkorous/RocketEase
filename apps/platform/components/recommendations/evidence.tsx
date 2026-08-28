"use client";

import { useState } from "react";
import type { Evidence, EvidenceMetric } from "@/db/schema/recommendations";

function formatValue(m: EvidenceMetric) {
  if (m.unit === "percent") return `${(m.value * 100).toFixed(1)}%`;
  if (m.unit === "days") return `${m.value} day${m.value === 1 ? "" : "s"}`;
  if (m.unit === "ratio") return `${m.value.toFixed(2)}x`;
  return m.value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** "Why we think this": the measured numbers, the window, the samples, the definitions version. */
export function EvidenceDetails({ evidence }: { evidence: Evidence }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button type="button" className="text-xs font-medium underline underline-offset-2" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Why we think this {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="mt-2 rounded-field bg-base-200 px-3 py-2 text-xs">
          <dl className="flex flex-col gap-1">
            {evidence.metrics.map((m) => (
              <div key={m.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-secondary">{m.label}</dt>
                <dd className="font-medium tabular-nums">{formatValue(m)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-secondary">
            Window {evidence.period.from} → {evidence.period.to} · {evidence.samples.map((s) => `${s.label}: ${s.n}`).join(" · ")}
          </p>
          {evidence.note && <p className="mt-1 text-secondary/70">{evidence.note}</p>}
          <p className="mt-1 text-secondary/70">Metric definitions {evidence.definitionsVersion}</p>
        </div>
      )}
    </div>
  );
}
