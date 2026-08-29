export * from "./types";
export * from "./inbox-types";
export * from "./insights-types";
export * from "./ads-types";
export { validateAgainstCapabilities } from "./validate";
export {
  CAPABILITY_CATALOG,
  CAPABILITY_PATHS,
  PUBLIC_CAPABILITY_CATALOG,
  capabilitySupported,
  catalogEntry,
  extraNotes,
  reasonFor,
  type CapabilityPath,
  type CatalogEntry,
} from "./catalog";
export { PROVIDER_COST_NOTES, estimatePublishCost, isFreeToPublish, type CapWindow, type CostVariant, type CostWindow, type PublishCost } from "./cost";
export { httpJson, categoryFromStatus } from "./http";
export { missingScopes, probe, retryAfterSeconds } from "./health";
/** Shared Google OAuth pieces — the YouTube adapter and the GA4 tracking source use the same Google client. */
export { googleAuthorizeUrl, googleTokenCall, mapYouTubeError as mapGoogleError, type GoogleError, type GoogleTokenResponse } from "./youtube/client";
export { mockProvider, mockControl, mockInbox, mockInsights, mockAds, type MockBehaviour } from "./mock";
export { createMetaProvider } from "./meta";
export { createLinkedInProvider } from "./linkedin";
export { createTikTokProvider } from "./tiktok";
export { createYouTubeProvider } from "./youtube";
export { createPinterestProvider } from "./pinterest";
export { createXProvider } from "./x";

import type { ProviderAdapter, ProviderConfig, ProviderKey } from "./types";
import { mockProvider } from "./mock";
import { createMetaProvider } from "./meta";
import { createLinkedInProvider } from "./linkedin";
import { createTikTokProvider } from "./tiktok";
import { createYouTubeProvider } from "./youtube";
import { createPinterestProvider } from "./pinterest";
import { createXProvider } from "./x";

export type ProviderRegistryConfig = Partial<Record<Exclude<ProviderKey, "mock">, ProviderConfig>> & { enableMock?: boolean };

/**
 * Build the set of adapters available in this deployment. A provider without
 * credentials configured simply isn't offered (feature-flag by configuration).
 */
export function createProviderRegistry(cfg: ProviderRegistryConfig): Map<ProviderKey, ProviderAdapter> {
  const m = new Map<ProviderKey, ProviderAdapter>();
  if (cfg.enableMock) m.set("mock", mockProvider);
  if (cfg.meta?.clientId) m.set("meta", createMetaProvider(cfg.meta));
  if (cfg.linkedin?.clientId) m.set("linkedin", createLinkedInProvider(cfg.linkedin));
  if (cfg.tiktok?.clientId) m.set("tiktok", createTikTokProvider(cfg.tiktok));
  if (cfg.youtube?.clientId) m.set("youtube", createYouTubeProvider(cfg.youtube));
  if (cfg.pinterest?.clientId) m.set("pinterest", createPinterestProvider(cfg.pinterest));
  if (cfg.x?.clientId) m.set("x", createXProvider(cfg.x));
  return m;
}
