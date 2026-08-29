/*
 * Serializable rows for the rights UI (Settings list, campaign clocks strip).
 */
import type { GrantRow } from "@/components/settings/rights-grants";
import type { AuthorizationGrant } from "@/db/schema/rights";
import { formatInZone, utcToZonedInput } from "@/lib/time";
import { daysUntil, remainingLabel } from "./format";
import { KIND_LABEL, SCOPE_LABEL } from "./types";

type Channel = { id: string; name: string; network: string };

const dayLabel = (d: Date | null, tz: string) => (d ? formatInZone(d, tz, { month: "short", day: "numeric", year: "numeric" }) : null);
const dateInput = (d: Date | null, tz: string) => (d ? utcToZonedInput(d, tz).slice(0, 10) : "");

function subjectOf(g: AuthorizationGrant, channels: Channel[]) {
  const ch = g.channelId ? channels.find((c) => c.id === g.channelId) : null;
  if (ch) return `${ch.name} · ${ch.network}`;
  if (g.creatorHandle) return `Creator ${g.creatorHandle}`;
  if (g.assetId) return "One asset in Content";
  return "Whole workspace";
}

export function grantRows(grants: AuthorizationGrant[], channels: Channel[], tz: string, now = new Date()): GrantRow[] {
  return grants.map((g) => ({
    id: g.id,
    kind: g.kind,
    kindLabel: KIND_LABEL[g.kind],
    scope: g.scope,
    scopeLabel: SCOPE_LABEL[g.scope],
    label: g.label,
    subject: subjectOf(g, channels),
    reference: g.reference,
    note: g.note,
    startsLabel: dayLabel(g.startsAt, tz),
    expiresLabel: dayLabel(g.expiresAt, tz),
    startsInput: dateInput(g.startsAt, tz),
    expiresInput: dateInput(g.expiresAt, tz),
    channelId: g.channelId ?? "",
    creatorHandle: g.creatorHandle ?? "",
    assetId: g.assetId ?? "",
    remaining: g.expiresAt ? remainingLabel(g.expiresAt, now) : null,
    expired: Boolean(g.expiresAt && daysUntil(g.expiresAt, now) < 0),
    revoked: Boolean(g.revokedAt),
  }));
}
