/*
 * One answer to "can this direct message go out now?" — read by the composer,
 * the send actions, the rule action and the worker just before the network
 * call, so every path refuses for the same reason. The window counts from the
 * customer's last message RocketEase has seen: a reaction or a button tap Meta
 * also counts is invisible here, so this window can be shorter than the
 * network's, never longer. Pure.
 */
import { MESSAGING_RULES, type MessagingRules, type Network } from "@rocketease/providers";

/** RocketEase's own rule, on every network: one automated direct message per contact per 24 h. A person may always write. */
export const AUTOMATED_DM_PER_DAY = 1;
const HOUR = 3_600_000;

export type SendInput = {
  network: Network;
  networkLabel: string;
  kind: string;
  now: Date;
  /** The customer's last message in this thread, as ingested. */
  lastInboundAt: Date | null;
  /** True when a rule, not a person, is sending. */
  automated: boolean;
  /** Direct messages this channel sent or has waiting, in the last 15 minutes and 24 hours. */
  recent: { per15min: number; per24h: number };
  /** Automated direct messages this contact got from this channel in the last 24 hours. */
  automatedToContact: number;
};

/** `retryAt` set = a cap that clears with time (the reply waits); null = only the customer can reopen it. */
export type SendDecision = { ok: true; closesAt: Date | null; rule: string | null } | { ok: false; why: string; retryAt: Date | null };

type Rules = Extract<MessagingRules, { dm: true }>;

function sinceLabel(ms: number) {
  const hours = Math.floor(ms / HOUR);
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min ago`;
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function windowCheck(i: SendInput, r: Rules): SendDecision | null {
  if (!r.windowHours) return null;
  if (!i.lastInboundAt) return { ok: false, why: `${i.networkLabel} allows a reply only within ${r.windowHours} h of a message from the customer, and none has arrived in this thread.`, retryAt: null };
  if (i.now.getTime() < i.lastInboundAt.getTime() + r.windowHours * HOUR) return null;
  const person = r.personWindow && !i.automated ? ` ${i.networkLabel} lets a person answer up to ${r.personWindow.days} days later with ${r.personWindow.needs}.` : "";
  return { ok: false, why: `${i.networkLabel} allows a reply within ${r.windowHours} h of the customer's last message; theirs was ${sinceLabel(i.now.getTime() - i.lastInboundAt.getTime())}. Wait for them to write again.${person}`, retryAt: null };
}

function capCheck(i: SendInput, r: Rules): SendDecision | null {
  const c = r.caps;
  if (!c) return null;
  if (c.per15min && i.recent.per15min >= c.per15min) return { ok: false, why: `${i.networkLabel} allows ${c.per15min} direct messages per 15 minutes from this account, and ${i.recent.per15min} were sent or queued in the last 15 minutes. It goes out when the limit clears.`, retryAt: new Date(i.now.getTime() + 15 * 60_000) };
  if (c.per24h && i.recent.per24h >= c.per24h) return { ok: false, why: `${i.networkLabel} allows ${c.per24h.toLocaleString()} direct messages per 24 hours from this account, and that many were sent or queued. It goes out when the limit clears.`, retryAt: new Date(i.now.getTime() + HOUR) };
  return null;
}

/** Public replies (comments, mentions, reviews) have no window; only a direct message is judged. */
export function sendDecision(i: SendInput): SendDecision {
  if (i.kind !== "message") return { ok: true, closesAt: null, rule: null };
  const r = MESSAGING_RULES[i.network];
  if (!r.dm) return { ok: false, why: r.why, retryAt: null };
  const blocked = windowCheck(i, r) ?? capCheck(i, r);
  if (blocked) return blocked;
  if (i.automated && i.automatedToContact >= AUTOMATED_DM_PER_DAY) {
    return { ok: false, why: `RocketEase sends at most ${AUTOMATED_DM_PER_DAY} automated direct message per contact per 24 h, and this contact already got one. A person can still reply.`, retryAt: null };
  }
  const closesAt = r.windowHours && i.lastInboundAt ? new Date(i.lastInboundAt.getTime() + r.windowHours * HOUR) : null;
  return { ok: true, closesAt, rule: r.windowHours ? `${i.networkLabel} allows a reply within ${r.windowHours} h of the customer's last message.` : null };
}
