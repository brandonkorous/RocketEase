"use client";

import { estimatePublishCost, isFreeToPublish, type ChannelKind, type ProviderKey, type PublishCost } from "@rocketease/providers/client";
import { NetMark } from "../library-screen";
import { NETWORK_LABEL, type ComposerChannel } from "./types";
import type { ComposerState } from "./use-composer";

/*
 * "Before you publish" — what this exact draft costs on each destination.
 * Numbers come from packages/providers/src/cost.ts, which cites its sources;
 * nothing here is computed from a guess, and a network with nothing sourced is
 * reported as having no per-post cost rather than as zero.
 */

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 });

type Priced = { channel: ComposerChannel; cost: PublishCost };

export function CostPreview({ s, channels }: { s: ComposerState; channels: ComposerChannel[] }) {
  const variant = {
    hasLink: Boolean(s.effectiveLink),
    hasVideo: s.chosenAssets.some((a) => a.kind === "video"),
    mediaCount: s.chosenAssets.length,
  };
  const priced: Priced[] = channels
    .filter((c) => s.selected.includes(c.id))
    .map((channel) => ({ channel, cost: estimatePublishCost(channel.provider as ProviderKey, channel.kind as ChannelKind, variant) }));
  if (priced.length === 0) return null;

  const charged = priced.filter((p) => !isFreeToPublish(p.cost));
  const free = priced.filter((p) => isFreeToPublish(p.cost));
  const spend = charged.reduce((sum, p) => sum + (p.cost.money?.amount ?? 0), 0);

  return (
    <section className="p-4" aria-labelledby="cost-preview-heading">
      <h2 id="cost-preview-heading" className="text-sm font-semibold">Before you publish</h2>
      {charged.length === 0 ? (
        <p className="mt-2 text-xs text-secondary/70">No per-post cost on any selected channel.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {charged.map((p) => (<CostLine key={p.channel.id} priced={p} />))}
        </ul>
      )}
      {spend > 0 && (
        <p className="mt-3 text-xs text-secondary">
          <span className="font-semibold text-base-content">{MONEY.format(spend)}</span> estimated network spend for this publish.
        </p>
      )}
      <FreeGroup free={free} />
    </section>
  );
}

function CostLine({ priced }: { priced: Priced }) {
  const { channel, cost } = priced;
  const label = NETWORK_LABEL[channel.network] ?? channel.network;
  return (
    <li className="flex gap-2.5 text-xs">
      <span className="mt-0.5 shrink-0"><NetMark network={channel.network} size={14} /></span>
      <div className="min-w-0">
        <p className="font-semibold text-base-content">{label} · {channel.name}</p>
        {cost.money && (
          <p className="mt-0.5 flex items-start gap-1.5 text-secondary">
            <MoneyIcon /><span><span className="text-base-content">{MONEY.format(cost.money.amount)}</span> — {cost.money.note}</span>
          </p>
        )}
        {cost.quota && (
          <p className="mt-0.5 flex items-start gap-1.5 text-secondary">
            <QuotaIcon /><span>{cost.quota.units.toLocaleString()} of {cost.quota.of.toLocaleString()} {cost.quota.window === "day" ? "daily" : cost.quota.window} units</span>
          </p>
        )}
        {cost.dailyCap && (
          <p className="mt-0.5 flex items-start gap-1.5 text-secondary">
            <CapIcon /><span>Counts toward today&rsquo;s {cost.dailyCap.count} — {cost.dailyCap.note}</span>
          </p>
        )}
      </div>
    </li>
  );
}

function FreeGroup({ free }: { free: Priced[] }) {
  if (free.length === 0) return null;
  const names = [...new Set(free.map((p) => NETWORK_LABEL[p.channel.network] ?? p.channel.network))];
  return (
    <p className="mt-3 flex items-start gap-1.5 text-xs text-secondary/70">
      <FreeIcon /><span>No per-post cost: {names.join(", ")}. No published limit we can source.</span>
    </p>
  );
}

const ICON = "mt-0.5 h-3.5 w-3.5 shrink-0";

/** Coin — real money the network bills. */
function MoneyIcon() {
  return (
    <svg className={ICON} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" role="img" aria-label="Cost">
      <circle cx="8" cy="8" r="6" /><path d="M8 4.5v7M9.8 6.2A2 2 0 0 0 8 5.4c-1 0-1.8.6-1.8 1.4s.8 1.3 1.8 1.4c1 .1 1.8.6 1.8 1.4S9 11 8 11a2 2 0 0 1-1.8-.8" strokeLinecap="round" />
    </svg>
  );
}

/** Gauge — a share of a periodic API allowance. */
function QuotaIcon() {
  return (
    <svg className={ICON} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" role="img" aria-label="API quota">
      <path d="M2.5 11.5a6 6 0 1 1 11 0" strokeLinecap="round" /><path d="M8 11 10.5 7" strokeLinecap="round" />
    </svg>
  );
}

/** Stacked bars — how many posts the window still accepts. */
function CapIcon() {
  return (
    <svg className={ICON} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" role="img" aria-label="Daily cap">
      <rect x="2.5" y="9.5" width="11" height="3" rx="1" /><rect x="2.5" y="3.5" width="11" height="3" rx="1" />
    </svg>
  );
}

/** Open circle — nothing charged, nothing capped. */
function FreeIcon() {
  return (
    <svg className={ICON} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" role="img" aria-label="No cost">
      <circle cx="8" cy="8" r="6" /><path d="M5.5 8h5" strokeLinecap="round" />
    </svg>
  );
}
