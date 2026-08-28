/*
 * Display strings for tracking sources. Kept free of API clients so panels and
 * query modules can import them without pulling in fetch/crypto code.
 * Every window string is what the source itself applies — we add no window.
 */
import type { TrackingKind } from "@/db/schema/tracking";

export const KIND_LABEL: Record<TrackingKind, string> = { ga4: "Google Analytics 4", shopify: "Shopify", webhook: "Conversion webhook" };

export const GA4_WINDOW = "GA4 session-scoped attribution, property default lookback";
export const SHOPIFY_WINDOW = "Last-click UTM recorded on the order's customer journey";
export const WEBHOOK_WINDOW = "As reported by the sender (no window is applied on our side)";

export const windowLabel = (kind: TrackingKind) => (kind === "ga4" ? GA4_WINDOW : kind === "shopify" ? SHOPIFY_WINDOW : WEBHOOK_WINDOW);

