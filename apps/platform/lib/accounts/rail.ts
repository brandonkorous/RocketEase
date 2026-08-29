/*
 * The right rail: what needs attention, what is still available, and what is
 * mid-connection. Every entry is a real row in this workspace — nothing here
 * is a suggestion we cannot actually complete.
 */
import type { ProviderConnection } from "@/db/schema/connections";
import type { TrackingKind } from "@/db/schema/tracking";
import { workspacePath } from "@/lib/nav";
import { daysUntil } from "./format";
import type { ExpiringRow, IntegrationRow, PendingRow, RecommendedRow, SummaryCounts } from "./types";

const EXPIRY_WARNING_DAYS = 14;

type Provider = { key: string; displayName: string; networks: string[]; accessSummary: string[] };

type Input = {
  workspaceId: string;
  rows: IntegrationRow[];
  conns: ProviderConnection[];
  connectable: Provider[];
  connectedProviders: Set<string>;
  connectedKinds: Set<TrackingKind>;
  trackingEnabled: { ga4: boolean; shopify: boolean };
  tz: string;
};

export function railLists(input: Input): { summary: SummaryCounts; expiring: ExpiringRow[]; recommended: RecommendedRow[]; pending: PendingRow[] } {
  const expiring = expiringRows(input);
  return { summary: counts(input.rows, expiring.length), expiring, recommended: recommendations(input), pending: pendingRows(input) };
}

function counts(rows: IntegrationRow[], expiring: number): SummaryCounts {
  const tone = (t: string) => rows.filter((r) => r.status.tone === t).length;
  return { total: rows.length, healthy: tone("success"), warnings: tone("warning"), errors: tone("error"), expiring };
}

const nameOf = (c: ProviderConnection, providers: Provider[]) => providers.find((p) => p.key === c.provider)?.displayName ?? c.provider;

function expiringRows({ workspaceId, conns, connectable }: Input): ExpiringRow[] {
  const out: ExpiringRow[] = [];
  for (const c of conns) {
    if (c.status === "disconnected" || c.status === "selecting") continue;
    const days = daysUntil(c.expiresAt);
    const expired = c.status === "expired" || c.status === "revoked" || (days !== null && days <= 0);
    if (!expired && (days === null || days > EXPIRY_WARNING_DAYS)) continue;
    const note = c.status === "revoked" ? "Access revoked" : expired ? "Token expired" : `Expires in ${days} day${days === 1 ? "" : "s"}`;
    out.push({
      id: c.id,
      network: connectable.find((p) => p.key === c.provider)?.networks[0] ?? null,
      title: `${nameOf(c, connectable)}${c.providerUserName ? ` · ${c.providerUserName}` : ""}`,
      note,
      action: { label: expired ? "Re-authenticate" : "Review", href: `/api/connect/${c.provider}/start?workspaceId=${workspaceId}&reconnect=${c.id}`, emphasis: expired },
    });
  }
  return out;
}

/** Conversion sources are connected from Settings → Tracking, which needs a property id or shop domain. */
const TRACKING_OFFERS: Record<TrackingKind, { title: string; blurb: string }> = {
  ga4: { title: "Google Analytics 4", blurb: "Daily sessions, key events, and revenue by UTM, filtered to social sources." },
  shopify: { title: "Shopify", blurb: "Daily orders and order value, attributed by the UTM values on each order's journey." },
  webhook: { title: "Conversion webhook", blurb: "A signed endpoint any pixel or CRM can post conversions to." },
};

function recommendations({ workspaceId, connectable, connectedProviders, connectedKinds, trackingEnabled }: Input): RecommendedRow[] {
  const networks: RecommendedRow[] = connectable
    .filter((p) => !connectedProviders.has(p.key))
    .map((p) => ({
      key: `provider:${p.key}`,
      network: p.networks[0] ?? null,
      title: p.displayName,
      blurb: p.accessSummary[0] ?? "Publish, engage, and measure from one place.",
      href: `/api/connect/${p.key}/start?workspaceId=${workspaceId}`,
    }));
  const sources: RecommendedRow[] = (Object.keys(TRACKING_OFFERS) as TrackingKind[])
    .filter((k) => !connectedKinds.has(k) && (k === "webhook" || trackingEnabled[k]))
    .map((k) => ({ key: `tracking:${k}`, network: null, title: TRACKING_OFFERS[k].title, blurb: TRACKING_OFFERS[k].blurb, href: workspacePath(workspaceId, "settings/tracking") }));
  return [...networks, ...sources];
}

function pendingRows({ workspaceId, conns, connectable }: Input): PendingRow[] {
  return conns
    .filter((c) => c.status === "selecting")
    .map((c) => ({
      id: c.id,
      network: connectable.find((p) => p.key === c.provider)?.networks[0] ?? null,
      title: nameOf(c, connectable),
      note: "Signed in. Choose which accounts join this workspace to finish.",
      selectHref: workspacePath(workspaceId, `accounts/select/${c.id}`),
    }));
}
