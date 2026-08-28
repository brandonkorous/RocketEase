/*
 * "Missing is not zero" (analytics.md): every conversion metric that cannot be
 * shown says exactly what is missing — no source, a source that needs
 * attention, no revenue data, or no spend to divide by.
 * Plain module (no db): server components and client panels both use it.
 */
import type { ConversionState } from "./conversions";

export const SETTINGS_HINT = "Settings → Tracking";

const noSource = (what: string) => `${what} needs a conversion tracking source. Connect Google Analytics 4, Shopify, or a conversion webhook in ${SETTINGS_HINT}.`;

function degraded(state: ConversionState): string | null {
  if (state.healthy > 0) return null;
  const names = state.sources.map((s) => `${s.name} (${s.kindLabel})`).join(", ");
  const reason = state.sources.map((s) => s.message).find(Boolean);
  return `Your conversion source needs attention: ${names}${reason ? ` — ${reason}` : ""}. Reconnect it in ${SETTINGS_HINT}.`;
}

/** Why site-reported conversions cannot be shown, or null when they can. */
export function conversionsUnavailable(state: ConversionState, hasPaidConversions: boolean): string | null {
  if (hasPaidConversions) return null;
  if (state.total === 0) return noSource("Conversions");
  return degraded(state);
}

export function revenueUnavailable(state: ConversionState): string | null {
  if (state.total === 0) return noSource("Revenue");
  const bad = degraded(state);
  if (bad) return bad;
  if (!state.hasRevenue) return "Your connected conversion source has not reported any revenue. GA4 needs ecommerce or purchase values enabled; a webhook source needs a `value` on its events.";
  return null;
}

/** ROAS needs both revenue from a tracking source and spend from an ad account. */
export function roasUnavailable(state: ConversionState, hasPaidSpend: boolean): string | null {
  const revenue = revenueUnavailable(state);
  if (revenue) return revenue;
  if (!hasPaidSpend) return "No paid spend in this period, so there is nothing to divide revenue by. Connect an ad account from a campaign's Ads tab.";
  return null;
}

/** Sessions come from GA4 only; Shopify and webhook sources report conversions, not traffic. */
export function sessionsUnavailable(state: ConversionState): string | null {
  const ga4 = state.sources.filter((s) => s.kind === "ga4");
  if (!ga4.length) return `Sessions come from Google Analytics 4. Connect a GA4 property in ${SETTINGS_HINT}.`;
  if (!ga4.some((s) => s.status === "healthy")) return degraded({ ...state, sources: ga4, healthy: 0 }) ?? null;
  return null;
}

/**
 * One answer for every tracking-supplied metric. `undefined` means "not a
 * tracking metric" so the caller falls through to its own paid/organic rules.
 */
export function trackingUnavailable(key: string, state: ConversionState, paid: { spend?: number; conversions?: number }): string | null | undefined {
  if (key === "conversions") return conversionsUnavailable(state, paid.conversions != null);
  if (key === "revenue") return revenueUnavailable(state);
  if (key === "sessions") return sessionsUnavailable(state);
  if (key === "roas") return roasUnavailable(state, paid.spend != null);
  return undefined;
}

export type ConversionProvenance = { model: string; window: string; sources: string[]; currency: string; freshAt: Date | null };

/** Model / window / source / currency / freshness for the attribution panel. */
export function conversionProvenance(state: ConversionState): ConversionProvenance | null {
  if (!state.total) return null;
  const windows = [...new Set(state.sources.map((s) => s.window))];
  return {
    model: "UTM last-click (source-reported)",
    window: windows.join(" / "),
    sources: state.sources.map((s) => `${s.name} (${s.kindLabel})`),
    currency: state.currencies.length === 1 ? state.currencies[0] : state.currencies.length ? `mixed (${state.currencies.join(", ")})` : "not reported",
    freshAt: state.lastSyncAt,
  };
}
