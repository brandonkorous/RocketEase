/*
 * Pure rules for connection-health notices: when a status change is news, and
 * the words. No I/O, so the worker and the tests share one definition.
 */
import type { ChannelStatus } from "@/db/schema/connections";
import { NETWORK_LABEL } from "@/lib/publishing/receipt-copy";

const BROKEN: ChannelStatus[] = ["action_required", "revoked"];

/** A channel that is already broken and stays broken is not news twice. */
export function needsHealthNotice(previous: ChannelStatus, next: ChannelStatus): boolean {
  return BROKEN.includes(next) && !BROKEN.includes(previous);
}

export type HealthChannel = { name: string; network: string; handle?: string | null; workspaceId: string; organizationId: string };

export function healthTitle(ch: HealthChannel, next: ChannelStatus): string {
  const who = ch.handle ?? ch.name;
  const net = NETWORK_LABEL[ch.network] ?? ch.network;
  return next === "revoked" ? `${who} on ${net} revoked RocketEase's access` : `${who} on ${net} needs to be reconnected`;
}

export function healthBody(next: ChannelStatus, message?: string | null): string {
  const cause = message ? `${message.trim().replace(/\.?$/, ".")} ` : "";
  return next === "revoked" ? `${cause}Nothing more will publish there until it is connected again.` : `${cause}Posts scheduled to this profile will wait until it is reconnected.`;
}
