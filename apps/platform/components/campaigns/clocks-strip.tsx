import { Badge } from "@wizeworks/silicaui-react";
import type { ClockRow } from "@/lib/rights/campaign";

const STATE: Record<ClockRow["state"], { glyph: string; color: "success" | "warning" | "error" | "neutral" }> = {
  ok: { glyph: "✓", color: "success" },
  warning: { glyph: "◷", color: "warning" },
  expired: { glyph: "!", color: "error" },
  revoked: { glyph: "⊘", color: "neutral" },
};

/** Rights clocks on the posts this campaign promotes (M8.4). Icon + label, never colour alone. */
export function ClocksStrip({ clocks }: { clocks: ClockRow[] }) {
  if (clocks.length === 0) return null;
  return (
    <section aria-labelledby="clocks-h" className="rounded-box border border-base-300 px-4 py-3">
      <h2 id="clocks-h" className="text-sm font-semibold">Clocks</h2>
      <p className="mt-0.5 text-xs text-secondary">Licences and authorisations behind the promoted posts. A promotion is blocked once a clock ends before its flight does.</p>
      <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        {clocks.map((c) => {
          const s = STATE[c.state];
          return (
            <li key={c.id} className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{c.what}</span>
                <Badge size="xs" variant="soft" color={s.color}><span aria-hidden="true">{s.glyph}</span> {c.state === "revoked" ? "Revoked" : c.remaining}</Badge>
              </div>
              <div className="text-xs text-secondary/70">{c.subject} · {c.scopeLabel} · until {c.expiresLabel}</div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
