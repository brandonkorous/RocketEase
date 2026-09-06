/*
 * One answer to "can this comment be hidden at the network?" — read by the
 * rule action and by the Hide button, so both refuse for the same reason.
 * The reasons come from HIDE_SUPPORT (packages/providers) and from the
 * channel's own recorded capabilities; nothing here guesses. Pure.
 */
import { HIDE_SUPPORT, type ProviderKey } from "@rocketease/providers";
import type { Channel } from "@/db/schema/connections";

export type HideDecision = { ok: true } | { ok: false; why: string };
export type HideChannel = Pick<Channel, "network" | "provider" | "status" | "capabilities" | "name">;

const KIND_WHY: Record<string, string> = {
  message: "A direct message has no audience, so there is nothing to hide it from.",
  review: "A review cannot be hidden. Reply to it, or report it on the network.",
  mention: "A mention is someone else's post; only comments on your own posts can be hidden.",
};

/** `canHide` says whether this provider's adapter is loaded here and implements hideItem (decide.ts plugs in the registry). */
export function hideDecision(ch: HideChannel, kind: string, canHide: (provider: ProviderKey) => boolean): HideDecision {
  if (kind !== "comment") return { ok: false, why: KIND_WHY[kind] ?? "Only comments can be hidden." };
  const support = HIDE_SUPPORT[ch.network];
  if (!support.hide) return { ok: false, why: support.why };
  if (ch.capabilities.inbox.hide === false) return { ok: false, why: ch.capabilities.reasons?.hide ?? `${ch.name} did not grant the permission needed to hide comments. Reconnect it.` };
  if (!canHide(ch.provider)) return { ok: false, why: `${ch.name}'s network is not enabled on this server.` };
  if (!["healthy", "degraded"].includes(ch.status)) return { ok: false, why: "The channel is disconnected. Reconnect it before hiding comments." };
  return { ok: true };
}
