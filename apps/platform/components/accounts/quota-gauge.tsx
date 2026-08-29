import { Progress } from "@wizeworks/silicaui-react";
import type { ChannelQuota } from "@/lib/channel-quota";

/*
 * Today's publishing headroom for one channel. The cap comes from the network
 * (packages/providers/src/cost.ts, sourced); the usage is only what we sent —
 * posts made in the native app count against the same cap and we cannot see
 * them, so the caption says so rather than implying the number is complete.
 */

const WINDOW_LABEL: Record<ChannelQuota["window"], string> = {
  "24h": "in the last 24 hours",
  day: "today",
};

export function QuotaGauge({ quota }: { quota: ChannelQuota }) {
  const left = Math.max(0, quota.cap - quota.used);
  const color = left === 0 ? "error" : left <= 1 ? "warning" : "neutral";
  return (
    <div className="mt-2 max-w-90">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="flex items-center gap-1.5 font-semibold">
          <GaugeIcon />
          {quota.used} of {quota.cap} {WINDOW_LABEL[quota.window]}
        </span>
        <span className="text-secondary/70">{left === 0 ? "No headroom left" : `${left} left`}</span>
      </div>
      <Progress className="mt-1" size="xs" color={color} value={Math.min(quota.used, quota.cap)} max={quota.cap} aria-label={`Publishes ${WINDOW_LABEL[quota.window]}`} />
      <p className="mt-1 text-xs text-secondary/70">Counted from posts sent through RocketEase. {quota.note}</p>
    </div>
  );
}

/** Gauge dial — matches the composer's quota mark. */
function GaugeIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" role="img" aria-label="Publishing cap">
      <path d="M2.5 11.5a6 6 0 1 1 11 0" strokeLinecap="round" /><path d="M8 11 10.5 7" strokeLinecap="round" />
    </svg>
  );
}
