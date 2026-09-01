import { Progress } from "@wizeworks/silicaui-react";
import type { AiUsageKind } from "@/db/schema/ai-usage";
import { formatCredits } from "@/lib/ai/usage/credits";
import { aiUsageSummary, type AiUsageSummary } from "@/lib/ai/usage/meter";
import { formatInZone } from "@/lib/time";

/*
 * AI credits used this month. 1 credit = 1,000 output tokens; input tokens
 * count at a fifth. The cap is hard — drafting is refused at it rather than
 * billed past it — so the state is always spelled out, never left to colour.
 */

const KIND_LABEL: Record<AiUsageKind, string> = {
  caption: "Captions",
  repurpose: "Repurposed posts",
  reply: "Reply suggestions",
  generate_post: "Generated posts",
  generate_ad: "Generated ads",
  generate_image: "Generated images",
  other: "Other",
};

type State = { color: "neutral" | "warning" | "error"; label: string; detail: string };

function state(s: AiUsageSummary): State {
  const { used, allowance, cap, remaining } = s.budget;
  if (!s.budget.allowed) return { color: "error", label: "Cap reached", detail: "Drafting is paused until credits reset." };
  if (used >= allowance) return { color: "warning", label: "Over the monthly allowance", detail: `${formatCredits(remaining)} credits left before the ${formatCredits(cap)} cap.` };
  return { color: "neutral", label: "Within allowance", detail: `${formatCredits(allowance - used)} credits left this month.` };
}

/** Server component. Rendered on Settings → Brand and on the billing page. */
export async function AiUsageMeter({ workspaceId }: { workspaceId: string }) {
  const summary = await aiUsageSummary(workspaceId);
  const { used, allowance, cap } = summary.budget;
  const s = state(summary);
  return (
    <section className="mt-8 max-w-180">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <CreditIcon />
        AI credits
      </h3>
      <p className="mt-1 text-sm text-secondary">
        One credit is 1,000 words of generated text; what a draft reads counts at a fifth. The cap is hard — nothing is billed past it.
      </p>
      <div className="mt-4 flex items-baseline justify-between gap-3 text-xs">
        <span className="font-semibold">
          {formatCredits(used)} of {formatCredits(allowance)} credits used
        </span>
        <span className="text-secondary/70">Cap {formatCredits(cap)}</span>
      </div>
      <Progress className="mt-1" size="xs" color={s.color} value={Math.min(used, cap)} max={cap} aria-label="AI credits used this month" />
      <p className="mt-2 flex items-center gap-1.5 text-xs">
        <StateIcon state={s.color} />
        <span className="font-semibold">{s.label}</span>
        <span className="text-secondary/70">{s.detail}</span>
      </p>
      <p className="mt-1 text-xs text-secondary/70">
        Resets on {formatInZone(summary.resetsAt, summary.timezone, { dateStyle: "long" })} ({summary.timezone}).
      </p>
      <Breakdown summary={summary} />
    </section>
  );
}

function Breakdown({ summary }: { summary: AiUsageSummary }) {
  if (!summary.byKind.length) return <p className="mt-4 text-xs text-secondary/70">Nothing generated this month yet.</p>;
  return (
    <table className="mt-4 w-full text-xs">
      <caption className="sr-only">AI credits used this month by feature</caption>
      <thead className="text-secondary/70">
        <tr className="border-b border-base-300">
          <th scope="col" className="py-1.5 text-left font-medium">Feature</th>
          <th scope="col" className="py-1.5 text-right font-medium">Requests</th>
          <th scope="col" className="py-1.5 text-right font-medium">Credits</th>
        </tr>
      </thead>
      <tbody>
        {summary.byKind.map((k) => (
          <tr key={k.kind} className="border-b border-base-300">
            <td className="py-1.5">{KIND_LABEL[k.kind] ?? k.kind}</td>
            <td className="py-1.5 text-right tabular-nums">{k.requests.toLocaleString("en-US")}</td>
            <td className="py-1.5 text-right tabular-nums">{formatCredits(k.credits)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CreditIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" role="img" aria-label="AI credits">
      <rect x="1.75" y="3.75" width="12.5" height="8.5" rx="1.5" /><path d="M1.75 6.75h12.5" strokeLinecap="round" />
    </svg>
  );
}

/** Status is icon + label, never colour alone (design.md). */
function StateIcon({ state }: { state: State["color"] }) {
  const path = state === "neutral" ? "M4.5 8.25 7 10.5l4.5-5" : state === "warning" ? "M8 5v3.5M8 11h.01" : "M5.5 5.5l5 5M10.5 5.5l-5 5";
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" role="img" aria-hidden="true">
      {state !== "neutral" && <circle cx="8" cy="8" r="6.25" />}
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
