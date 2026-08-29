"use client";

import { cloneElement, type ReactElement } from "react";
import { Tooltip } from "@wizeworks/silicaui-react";

type Disableable = { disabled?: boolean; "aria-disabled"?: boolean };

export type WhyNotProps = {
  /** The capability reason (`capabilities.reasons`). No reason = the control renders untouched. */
  reason?: string | null;
  children: ReactElement<Disableable>;
  side?: "top" | "bottom" | "left" | "right";
};

/**
 * A control the network can't do: disabled, with the declared reason on hover
 * and on keyboard focus. The wrapper span carries the tooltip because a
 * disabled element fires no pointer events of its own.
 */
export function WhyNot({ reason, children, side = "top" }: WhyNotProps) {
  if (!reason) return children;
  return (
    <Tooltip content={<span className="block max-w-70 text-xs leading-relaxed">{reason}</span>} side={side} delay={150}>
      <span tabIndex={0} aria-label={reason} className="inline-flex cursor-not-allowed">
        {cloneElement(children, { disabled: true, "aria-disabled": true })}
      </span>
    </Tooltip>
  );
}

export type CapabilityItem = { label: string; ok: boolean; reason?: string | null };

/** Capability list for a channel: supported items plain, unsupported ones muted with their reason. */
export function CapabilityList({ items, className }: { items: CapabilityItem[]; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-3 gap-y-1 text-sm ${className ?? ""}`}>
      {items.map((i) => (
        <li key={i.label}>{i.ok ? <span className="text-secondary">✓ {i.label}</span> : <Unsupported label={i.label} reason={i.reason} />}</li>
      ))}
    </ul>
  );
}

function Unsupported({ label, reason }: { label: string; reason?: string | null }) {
  const text = <span className="text-secondary/60">— {label}</span>;
  if (!reason) return text;
  return (
    <Tooltip content={<span className="block max-w-70 text-xs leading-relaxed">{reason}</span>} delay={150}>
      <span tabIndex={0} aria-disabled className="cursor-help" aria-label={`${label} unavailable: ${reason}`}>{text}</span>
    </Tooltip>
  );
}
