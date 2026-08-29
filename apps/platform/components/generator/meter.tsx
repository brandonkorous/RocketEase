"use client";

/**
 * Length meter. A channel with no published limit shows a count and no bar —
 * we never draw a target we cannot source.
 */
export function LengthMeter({ label, count, limit, note }: { label: string; count: number; limit?: number; note?: string }) {
  const over = limit !== undefined && count > limit;
  const pct = limit ? Math.min(100, Math.round((count / limit) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        <span className={over ? "text-error" : "text-secondary/70"}>{limit === undefined ? `${count} characters` : `${count} / ${limit}`}</span>
      </div>
      {limit !== undefined && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-base-200" role="presentation">
          <div className={`h-full ${over ? "bg-error" : "bg-base-content"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {note && <p className="text-xs text-secondary/70">{note}</p>}
    </div>
  );
}

export function IssueList({ issues }: { issues: { severity: "error" | "warning"; message: string }[] }) {
  if (!issues.length) return null;
  return (
    <ul className="flex flex-col gap-1" aria-label="Issues">
      {issues.map((i, idx) => (
        <li key={idx} className={`rounded-field px-2.5 py-1.5 text-xs ${i.severity === "error" ? "bg-error/10 text-error" : "bg-warning/10 text-warning"}`}>
          {i.severity === "error" ? "Error: " : "Check: "}
          {i.message}
        </li>
      ))}
    </ul>
  );
}
